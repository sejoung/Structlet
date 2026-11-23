# ADR 0017: Google Analytics 사용 통계

- 상태: 채택
- 날짜: 2026-11-20
- 출처: Stormlet ADR 0014(같은 저작자, MIT)

## 배경

배포한 사이트를 몇 명이 쓰는지, 어떤 기능을 쓰는지, 사용자 쪽에서 어떤 오류가 나는지 알 수 없다. 반면 로컬 우선 원칙에 따라 구성도 내용은 어디로도 보내지 않는다.

## 결정

1. **GA4 직접 연결**: `gtag.js`를 측정 ID(`VITE_GA_MEASUREMENT_ID`)로 불러온다. GTM은 쓰지 않는다. 값이 없거나 `G-…` 형식이 아니면 이 기능 없이 빌드한다. 프로덕션 빌드에서만, 그리고 웹 origin에서만 켠다.
2. **동의한 뒤에만 불러온다**: 처음 방문하면 캔버스를 가리지 않는 배너로 묻는다. 허용 전에는 스크립트를 불러오지 않고 아무것도 보내지 않는다. 선택은 `structlet.usage-stats`에 저장하고 **설정(⚙) → 사용 통계 보내기**에서 바꾼다. 거부하면 전송을 멈추고(`ga-disable-<ID>`, consent `denied`) `_ga` 쿠키를 지운다. 광고 저장소·광고 개인화·Google 신호는 항상 끈다.
3. **이벤트 기록에서 골라 보낸다**: 앱은 GA를 모른다. 기능을 쓰면 페이지 안의 이벤트 기록(`adapters/diagnostics/log.ts`)에 남기고, GA 어댑터가 목록에 있는 것만 GA 이벤트로 바꿔 보낸다. 세부 값도 목록에 있는 것만, 짧은 코드 단어나 숫자일 때만 보낸다. 오류는 이벤트 이름만 `app_error`로 보내고 메시지는 보내지 않는다. 페이지마다 20개까지다.
4. **주소에서 내용을 뺀다**: `page_location`은 origin과 경로만 쓰고, 페이지 제목은 항상 `Structlet`이다.
5. **CSP**: 측정 ID가 있는 빌드에서만 GA origin을 연다(`scripts/csp.ts`).

## 보내는 이벤트

| GA 이벤트 | 언제 | 함께 보내는 값 |
| --- | --- | --- |
| `page_view` | 허용한 뒤 페이지를 열 때 | origin과 경로 |
| `diagram_created`, `sample_downloaded`, `file_opened` | 새로 만들기, 샘플 다운로드, `.structlet` 열기 | |
| `file_saved` | 저장 | `target` (`drive`·`file`·`download`) |
| `image_exported` | SVG·PNG 내보내기 | `format`, `view` (`2d`·`isometric`) |
| `diagram_imported` | 가져오기 | `source` (`draft`·`compose`·`kubernetes`·`terraform`) |
| `icon_pack_loaded` | 아이콘 팩 불러오기 | `provider` |
| `drive_connected`, `drive_file_created`, `drive_file_opened` | Drive 연결·파일 만들기·열기 | |
| `view_changed`, `view_mode_used` | 2D/아이소메트릭 전환, 보기 모드 | `view` |
| `app_error` | 오류 수준 기록 | `error_event` (기록 이벤트 이름) |

이벤트를 더하려면 기록을 남기고 `src/adapters/analytics/usage-events.ts`의 목록에 넣는다.

## 결과

허용한 사용자만 집계되므로 실제보다 적게 잡힌다. `tests/unit/adapters/analytics.test.ts`는 다음을 검사한다: 허용 전 무전송, 허용 후 스크립트, 목록 이벤트만, 사용자 문장 제외, 오류 상한, 거부 시 쿠키 삭제, 설정 조건, CSP 구성. `tests/e2e/analytics-csp.spec.ts`는 측정 ID가 있는 빌드에서 배너·허용·이벤트·주소·끄기·거부를, 기본 빌드에서 CSP 위반이 없는지를 확인한다.
