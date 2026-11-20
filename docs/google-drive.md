# Google Drive 연결과 사용 통계 설정

Drive 연결과 사용 통계는 선택 기능이다. 값을 넣고 빌드한 경우에만 켜지고, 값이 없으면 앱은 브라우저 저장과 파일 저장만으로 그대로 동작한다. 설계는 [ADR 0016](adr/0016-google-drive-sync.md)(Drive)과 [ADR 0017](adr/0017-usage-statistics.md)(사용 통계)에 있다.

## 환경 변수

`.env.example`을 `.env.local`로 복사해 값을 넣고 개발 서버를 다시 시작하거나 다시 빌드한다. 네 값은 모두 번들에 들어가는 **공개 설정**이다. **client secret은 절대 넣지 않는다.**

```sh
VITE_GOOGLE_CLIENT_ID=1234567890-xxxx.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=AIza...
VITE_GOOGLE_APP_ID=1234567890          # Google Cloud 프로젝트 번호
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX    # 사용 통계(선택)
```

## Google Cloud 설정 (Drive)

1. 프로젝트에서 **Google Drive API**와 **Google Picker API**를 활성화한다.
2. OAuth 동의 화면을 만들고 범위에 `https://www.googleapis.com/auth/drive.file`만 넣는다. 이 범위는 Structlet이 만들었거나 사용자가 Picker로 고른 파일에만 접근한다. 테스트 모드면 사용할 계정을 테스트 사용자로 등록한다. 누구나 쓰게 하려면 게시(프로덕션)한다.
3. **웹 애플리케이션** OAuth 클라이언트의 **승인된 JavaScript 원본**에 다음을 등록한다. 경로는 넣지 않는다.
   - 개발: `http://127.0.0.1:5183` (Structlet 개발 서버 주소)
   - 빌드 미리보기: `http://127.0.0.1:5184`
   - 배포: `https://<배포 도메인>`
   - Stormlet과 같은 클라이언트를 쓰면 Structlet 원본을 **추가로** 등록해야 한다.
4. 브라우저용 API 키에 다음 제한을 건다. 이 키는 Picker의 개발자 키로만 쓰이고, Drive 파일 읽기·쓰기는 OAuth 토큰으로 한다.

| 설정 | 값 |
| --- | --- |
| 애플리케이션 제한(웹사이트) | `http://127.0.0.1:5183/*`, `http://127.0.0.1:5184/*`, `https://<배포 도메인>/*`, `https://docs.google.com/*` |
| API 제한 | Google Picker API |

- `index.html`의 referrer 정책 때문에 Google에는 origin만 전달된다. 웹사이트 제한에 하위 경로를 쓰면 일치하지 않는다.
- Picker는 `docs.google.com` iframe 안에서 키를 쓰므로 `https://docs.google.com/*`가 필요하다. 빠지면 Picker에 "API 개발자 키가 잘못되었습니다"가 표시된다.
- 제한 변경은 반영까지 몇 분 걸린다. 콘솔의 `Cross-Origin-Opener-Policy ... window.closed` 경고는 Google 로그인 팝업의 정상 경고다.

## GA4 설정 (사용 통계)

GA4 속성과 웹 데이터 스트림을 만들고 측정 ID(`G-…`)를 `VITE_GA_MEASUREMENT_ID`에 넣는다. Stormlet과 섞이지 않게 **Structlet 전용 속성**을 권한다. 프로덕션 빌드에서만 켜지고(`npm run dev`는 보내지 않음), 사용자가 배너에서 허용한 뒤에만 Google 스크립트를 불러온다.

## 배포

- **웹 배포**(`npm run build` → `dist/`): 상대 경로라 어떤 정적 호스팅에도 올릴 수 있다. CSP는 빌드한 설정에 필요한 Google origin만 연다. GitHub Pages는 저장소 Actions 변수에 위 값을 넣고 **Pages** 워크플로를 수동 실행한다([docs/ci.md](ci.md)).
- **HTML 한 파일**(`npm run build:single`): `file://`에는 등록할 수 있는 origin이 없어 Google 로그인이 동작하지 않는다. 그래서 Drive와 사용 통계는 꺼지고, 파일 메뉴에 이유가 표시된다.
- **origin을 Stormlet과 나눈다.** 브라우저 저장소와 탭 간 채널은 경로가 아니라 origin 단위로 공유된다. 같은 `https://<계정>.github.io`에 Stormlet과 함께 올리면 서로의 저장 정보와 Drive 토큰 채널에 접근할 수 있다. Drive를 켜는 배포는 Structlet 전용 도메인(또는 별도 origin)에 둔다.

## 동작

- **연결**: 제목 옆 Drive 버튼(`Drive 연결`)이나 파일 → Google Drive 연결. Google 스크립트는 버튼에 포인터가 오거나 파일 메뉴를 열 때 미리 불러온다. 로그인 팝업은 사용자 동작 안에서만 열 수 있기 때문이다.
- **저장**: 연결 뒤 Drive 버튼은 `Drive에 저장`이 된다. 파일과 연결되면 이 브라우저 저장 표시 대신 Drive 상태(구름 아이콘: 저장됨·저장 중·다시 연결·충돌·저장 안 됨)가 그 자리에 나온다. 아이콘은 Google 로고를 바꿔 그리지 않도록 일반 구름 기호(Lucide)를 쓴다. 처음에는 Picker로 폴더를 고르고, 그 폴더를 기억한다. 이후 그 파일과 동기화한다. 파일 → `다른 폴더에 사본 저장…`으로 새 파일로 옮길 수 있다. 연결된 상태에서 **새로 만들기**로 시작한 구성도는 첫 편집 때 그 폴더에 파일이 만들어진다.
- **자동 저장**: 편집이 2초 멈추면 저장하고, 계속 편집해도 최대 10초마다 저장한다. 연결된 구성도에서 ⌘/Ctrl+S는 내려받기 대신 Drive에 바로 저장한다.
- **열기**: 파일 → `Drive에서 열기…`로 Picker에서 고른다. 연 파일에는 바로 다시 쓰지 않는다. 지금 구성도가 Drive에 없으면 바꾸기 전에 확인한다.
- **다른 곳의 변경**: 저장 직전에 파일 버전을 확인한다. 바뀌었으면 마지막 동기화본을 기준으로 3방향 병합한다. 다른 객체·다른 필드는 자동으로 합치고, 같은 필드를 다르게 바꾼 경우와 한쪽이 지운 것을 다른 쪽이 고친 경우만 충돌로 보여 항목마다 고르게 한다. 합친 원격 변경은 실행 취소 기록에 들어가지 않는다.
- **접근 만료**: 토큰은 메모리에만 있고 약 1시간 유효하다. 만료 10분 전부터 버튼이 `연장`이 되고, 앱 어디든 클릭하면 갱신한다. 만료되면 `다시 연결`이 되고 편집은 브라우저에 남는다. 열린 탭끼리는 토큰을 넘겨받아 다시 로그인하지 않는다.
- **실패**: 네트워크와 요청 한도 초과는 5·15·60초 뒤 다시 시도한다. 권한·용량·삭제·읽을 수 없는 파일은 멈추고 Drive 창에서 `다시 시도`할 수 있다. 다시 연결한 계정이 파일의 계정과 다르면 쓰지 않는다.
- **연결 해제**: 모든 탭에서 Google 권한을 철회한다. 연결 파일과 폴더 정보는 기억해 다시 연결하면 이어서 저장한다. 공용 컴퓨터라면 `이 브라우저의 연결 파일·폴더 정보도 지우기`를 고른다.

브라우저에는 연결 파일의 ID·이름·버전·계정과 마지막 동기화본(`structlet.drive.file`, `structlet.drive.base`), 응답을 기다리는 생성의 폴더·파일 ID(`structlet.drive.creating`), 저장 폴더(`structlet.drive.folder`)만 저장한다. 토큰은 저장하지 않는다.

## 확인할 것 (실제 계정)

자동 테스트는 Google 스크립트와 Drive REST를 브라우저 안에서 흉내 낸다. 실제 OAuth 동의, Picker, 권한 철회, ETag 노출은 등록한 origin에서 직접 확인한다.

1. 개발 서버(`npm run dev`, `http://127.0.0.1:5183`)에서 Drive 연결 → 폴더 선택 → 저장
2. 다른 탭에서 같은 파일을 열어 각각 고친 뒤 병합되는지 확인
3. 연결 해제 → 다시 연결 → 이어서 저장되는지 확인
4. 빌드 미리보기(`npm run build && npm run preview`, `http://127.0.0.1:5184`)에서 사용 통계 배너 → 허용 → GA 실시간 보고서에 `page_view`, `image_exported` 표시
