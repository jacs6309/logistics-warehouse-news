
// netlify/functions/news.js
//
// 업계 뉴스 수집 함수 (물류창고 / 건축 / 건축 AI)
// - 카테고리별 전문지 RSS (있는 경우, 키워드 필터링 불필요 — 이미 해당 분야 기사만 모여있음)
// - 구글 뉴스 검색 RSS (카테고리별 키워드로 검색)
// 두 소스를 서버에서 fetch → 파싱 → 병합 → 날짜순 정렬 후 JSON으로 반환한다.
// 브라우저에서 직접 RSS를 fetch하면 CORS 때문에 막히므로, 이 서버리스 함수가 프록시 역할을 한다.

const Parser = require("rss-parser");

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  },
});

// 카테고리 정의: 필요하면 이 객체만 수정/추가하면 됨
const CATEGORIES = {
  logistics: {
    label: "물류창고",
    rss: {
      url: "https://www.klnews.co.kr/rss/S1N8.xml",
      label: "물류신문",
    },
    defaultKeywords: [
      "물류창고",
      "물류센터 개발",
      "풀필먼트센터",
      "냉동물류센터",
      "스마트물류센터",
    ],
  },
  architecture: {
    label: "건축",
    rss: {
      url: "http://www.ancnews.kr/rss/allArticle.xml",
      label: "건축사신문",
    },
    defaultKeywords: [
      "건축법 개정",
      "건축허가",
      "용도변경",
      "건축 정책",
      "건축 트렌드",
    ],
  },
  "architecture-ai": {
    label: "건축 AI",
    rss: null, // 전문 RSS 없음 — 구글 뉴스 검색만 사용
    defaultKeywords: [
      "건축 AI",
      "AI 설계",
      "생성형 AI 건축",
      "BIM AI",
      "건축 인공지능",
    ],
  },
};

const DEFAULT_CATEGORY = "logistics";

function buildGoogleNewsUrl(keywords) {
  // 여러 키워드를 OR 로 묶어 한 번의 요청으로 폭넓게 검색
  const query = keywords.map((k) => `"${k}"`).join(" OR ");
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=ko&gl=KR&ceid=KR:ko`;
}

// 기사 제목 앞부분을 기준으로 대략적인 중복 제거 (구글 뉴스는 같은 기사를 여러 매체가 다루는 경우가 많음)
function dedupeKey(title) {
  return (title || "")
    .replace(/\s+/g, "")
    .replace(/[\[\]()【】-]/g, "")
    .slice(0, 30);
}

async function fetchSource(url, sourceLabel, isGoogle) {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map((item) => {
      const pubDate = item.isoDate || item.pubDate || null;
      return {
        title: (item.title || "").trim(),
        link: item.link || "",
        source: isGoogle
          ? (item.source && (item.source.title || item.source)) ||
            extractGoogleSource(item.title) ||
            "구글뉴스"
          : sourceLabel,
        isGoogle,
        pubDate,
        pubDateTs: pubDate ? new Date(pubDate).getTime() : 0,
        // 구글 뉴스의 description은 실제 본문이 아니라 제목/매체명 반복이라 스니펫을 표시하지 않음
        snippet: isGoogle
          ? ""
          : cleanSnippet(item.contentSnippet || item.content || ""),
      };
    });
  } catch (err) {
    console.error(`[news] failed to fetch ${sourceLabel} (${url}):`, err.message);
    return [];
  }
}

// 구글 뉴스는 title이 보통 "기사제목 - 매체명" 형식이라 매체명을 뽑아본다
function extractGoogleSource(title) {
  if (!title) return null;
  const parts = title.split(" - ");
  return parts.length > 1 ? parts[parts.length - 1].trim() : null;
}

function cleanSnippet(text) {
  return (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const categoryKey = CATEGORIES[params.category] ? params.category : DEFAULT_CATEGORY;
    const category = CATEGORIES[categoryKey];

    const keywords =
      params.keywords && params.keywords.trim()
        ? params.keywords.split(",").map((s) => s.trim()).filter(Boolean)
        : category.defaultKeywords;

    const googleUrl = buildGoogleNewsUrl(keywords);

    const fetches = [fetchSource(googleUrl, "구글뉴스", true)];
    if (category.rss) {
      fetches.push(fetchSource(category.rss.url, category.rss.label, false));
    }

    const results = await Promise.all(fetches);
    let merged = results.flat();

    // 중복 제거 (제목 앞부분 기준, 전문지 소스를 우선 유지하도록 먼저 넣은 항목을 유지)
    const seen = new Map();
    for (const item of merged) {
      const key = dedupeKey(item.title);
      if (!seen.has(key)) {
        seen.set(key, item);
      }
    }
    merged = Array.from(seen.values());

    // 최신순 정렬
    merged.sort((a, b) => b.pubDateTs - a.pubDateTs);

    // 상위 60개만
    merged = merged.slice(0, 60);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // 클릭할 때마다 구글/전문지에 과도하게 요청하지 않도록 짧게 캐싱
        "Cache-Control": "public, max-age=300",
      },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        category: categoryKey,
        categoryLabel: category.label,
        keywords,
        count: merged.length,
        items: merged,
      }),
    };
  } catch (err) {
    console.error("[news] handler error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "뉴스를 가져오는 중 오류가 발생했습니다." }),
    };
  }
};
