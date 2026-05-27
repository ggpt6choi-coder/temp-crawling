# Community Crawler & Google Sheets Integrator

구글 스프레드시트의 **`키워드` 탭**에 입력된 검색어를 기반으로 주요 온라인 커뮤니티(뽐뿌, 네이버 카페, 루리웹, 에펨코리아)의 최신 게시글을 크롤링하여 다시 구글 스프레드시트에 자동으로 기록하는 프로젝트입니다.

## 📌 주요 기능
* **다중 커뮤니티 지원**: 뽐뿌, 네이버 카페, 루리웹, 에펨코리아
* **동적 키워드 관리**: 구글 시트의 `키워드` 탭에 검색어를 작성하면 크롤러가 실행 시 자동으로 읽어와 반영 (인터넷 연결 실패 시 로컬 `keywords.json` 폴백)
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

### 2. 키워드 설정 (구글 시트)
크롤링 대상 데이터를 모아두는 구글 스프레드시트 파일에 **`키워드`**라는 이름의 새 탭을 생성하고, **A열(A1 셀부터 아래로)**에 검색을 원하는 키워드들을 한 줄에 하나씩 입력해 둡니다.

> **참고**: 스크립트는 실행 시 자동으로 구글 시트에서 키워드를 읽어옵니다. 시트에서 키워드를 불러오는 데 실패할 경우 예비용(Fallback)으로 프로젝트 내의 `keywords.json` 파일에 작성된 키워드를 사용합니다.

### 3. 크롤링 실행
아래 명령어를 실행하면 4개의 커뮤니티 크롤러가 순차적으로 실행된 뒤 통합 결과를 구글 시트로 전송합니다.
```bash
npm start
```
*(내부적으로 `node scripts/index.js` 마스터 스크립트를 실행합니다.)*

## 📁 구조 설명

* `scripts/index.js`: 시트에서 키워드를 가져오고, 전체 크롤러를 순차적으로 실행한 뒤, 취합된 데이터를 구글 시트로 전송하는 메인 런너(Runner).
* `scripts/ppomppu.js`, `naver.js`, `ruliweb.js`, `fmkorea.js`: 각 커뮤니티별 크롤링 로직을 담고 있으며, 단독 실행 시 CSV 파일을 생성하도록 되어 있습니다. 통합 실행 시에는 배열 형태로 결과값만 반환합니다.
* `.github/workflows/scrape.yml`: 매일 오전 6시 자동 실행을 담당하는 Github Actions 워크플로우.

---

## 📝 구글 앱스 스크립트(GAS) 설정

이 스크립트가 정상적으로 작동하려면 연결된 구글 스프레드시트에 아래의 앱스 스크립트 코드가 세팅되어 있어야 합니다.

### 설정 방법
1. 구글 스프레드시트를 열고 상단 메뉴에서 **확장 프로그램** -> **Apps Script**를 클릭합니다.
2. 에디터 창에 아래의 코드를 모두 복사해서 붙여넣습니다.
3. 💾 (저장) 버튼을 누른 후, 우측 상단의 **배포(Deploy)** -> **새 배포(New deployment)**를 선택합니다.
4. **유형 선택** 옆의 톱니바퀴를 누르고 **웹 앱(Web App)**을 선택합니다.
5. **액세스 권한이 있는 사용자**를 `모든 사용자(Anyone)`로 설정한 뒤 배포합니다.
6. 권한 검토 창이 뜨면 고급을 눌러 안전하지 않음(Go to project)으로 이동하여 허용해줍니다.
7. 생성된 **웹앱 URL(Web app URL)**을 복사하여 프로젝트의 `.env.local` 파일 및 Github Secrets(`GOOGLE_SHEET_WEBAPP_URL`)에 저장합니다.

### Apps Script 코드 (Code.gs)

```javascript
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheetName = payload.sheetName;
    var headers = payload.headers;
    var rows = payload.rows;
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    
    // 시트가 없으면 새로 생성하고 헤더를 추가
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
    }
    
    // 데이터 추가 (기존 데이터 아래에 이어붙임)
    if (rows && rows.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", rowsAdded: rows.length }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // "키워드" 시트에서 검색어 목록을 읽어옴
    var sheet = ss.getSheetByName("키워드");
    
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "'키워드' 시트가 없습니다." }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    var lastRow = sheet.getLastRow();
    if (lastRow === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", keywords: [] }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
    
    // A열에 있는 모든 데이터를 읽어옴
    var data = sheet.getRange(1, 1, lastRow, 1).getValues();
    var keywords = [];
    
    for (var i = 0; i < data.length; i++) {
      if (data[i][0]) {
        // 공백 제거 후 배열에 추가
        keywords.push(data[i][0].toString().trim());
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", keywords: keywords }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
```
