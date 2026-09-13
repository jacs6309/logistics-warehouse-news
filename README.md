# 물류창고 업계 뉴스

버튼 클릭 한 번으로 물류창고/물류센터 관련 최신 뉴스를 모아 보여주는 페이지입니다.

## 소스
- 물류신문 "물류센터" 카테고리 RSS
- 구글 뉴스 검색 RSS (기본 키워드: 물류창고, 물류센터 개발, 풀필먼트센터, 냉동물류센터, 스마트물류센터)

## 구조
- `index.html` — 검색 버튼과 결과 카드 UI
- `netlify/functions/news.js` — 두 RSS를 서버에서 가져와 병합/정렬해 JSON으로 반환하는 서버리스 함수 (CORS 우회 겸 프록시 역할)
- `netlify.toml` — Netlify 빌드/함수 설정 (`/api/news` → 함수 경로로 리다이렉트)
- `package.json` — `rss-parser` 의존성

## 배포
Netlify에서 이 레포를 "Import an existing project"로 연결하면 별도 설정 없이 자동 배포됩니다 (API 키 불필요).

## 키워드 수정
`index.html`의 "검색 키워드 수정"에서 즉석으로 바꿔볼 수 있고, 기본값을 바꾸려면 `netlify/functions/news.js`의 `DEFAULT_KEYWORDS` 배열을 수정하면 됩니다.
