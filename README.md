# Community Crawler & Google Sheets Integrator

지정된 키워드(`keywords.json`)를 기반으로 주요 온라인 커뮤니티(뽐뿌, 네이버 카페, 루리웹, 에펨코리아)의 최신 게시글을 크롤링하여 구글 스프레드시트에 자동으로 기록하는 프로젝트입니다.

## 📌 주요 기능
* **다중 커뮤니티 지원**: 뽐뿌, 네이버 카페, 루리웹, 에펨코리아
* **중앙화된 키워드 관리**: `keywords.json` 파일에서 검색할 키워드 일괄 관리
* **메모리 기반 고속 처리**: 중간에 CSV 파일을 하드디스크에 생성하지 않고, 크롤링 즉시 메모리에 담아두었다가 구글 시트로 한 번에 전송
* **자동화 (Github Actions)**: 매일 정해진 시간(한국 시간 기준 오전 6시)에 자동으로 크롤링 및 구글 시트 업데이트 수행

## ⚙️ 설정 및 환경변수

프로젝트 루트 디렉토리에 `.env.local` 파일을 만들고 아래 환경변수를 입력합니다. (Github Actions 자동화 시에는 Repository Secrets에 동일하게 등록해야 합니다.)

```env
# 필수: 구글 시트 앱스 스크립트(Web App) URL
GOOGLE_SHEET_WEBAPP_URL=https://script.google.com/macros/s/.../exec

# 선택 사항: 네이버 카페 ID (기본값: 11262350)
CAFE_ID=11262350
# 선택 사항: 각 스크립트가 최대로 탐색할 페이지 수 (기본값: 5)
PAGES=5
```

## 🚀 실행 방법

### 1. 패키지 설치 및 의존성 세팅
```bash
npm install
npx playwright install --with-deps
```

### 2. 키워드 설정
프로젝트 루트의 `keywords.json` 파일을 열어 원하는 검색어를 배열 형태로 관리합니다.
```json
[
  "로보락",
  "드리미",
  "모바",
  "나르왈",
  "에코백스",
  "삼성"
]
```

### 3. 크롤링 실행
아래 명령어를 실행하면 4개의 커뮤니티 크롤러가 순차적으로 실행된 뒤 통합 결과를 구글 시트로 전송합니다.
```bash
npm start
```
*(내부적으로 `node scripts/index.js` 마스터 스크립트를 실행합니다.)*

## 📁 구조 설명

* `scripts/index.js`: 전체 크롤러를 순차적으로 실행하고, 취합된 데이터를 구글 시트로 전송하는 메인 런너(Runner).
* `scripts/ppomppu.js`, `naver.js`, `ruliweb.js`, `fmkorea.js`: 각 커뮤니티별 크롤링 로직을 담고 있으며, 단독 실행 시 CSV 파일을 생성하도록 되어 있습니다. 통합 실행 시에는 배열 형태로 결과값만 반환합니다.
* `.github/workflows/scrape.yml`: 매일 오전 6시 자동 실행을 담당하는 Github Actions 워크플로우.
