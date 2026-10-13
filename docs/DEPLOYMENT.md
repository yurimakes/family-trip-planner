# 공개 데모 배포

공개 정적 데모와 개발용 로컬 API를 구분한다. 배포 코드는 준비됐으며 Pages 설정·워크플로 실행과 실제 URL 확인 전에는 배포 완료로 표시하지 않는다.

배포 대상은 설치 없이 URL로 여는 일반 웹 체험이다.

## 체험 범위

| 구분 | 공개 정적 데모 | 로컬 Python 서버 |
| --- | --- | --- |
| 후보·보행·시간·비용 | 가상 데이터 | 같은 가상 데이터 |
| 일정 검사 | 브라우저 JavaScript | Python에서 확정 재검사 |
| 선택·일정 저장 | 이 탭의 메모리. 새로고침 시 초기화 | SQLite 저장. 새로고침 후 자동 복구는 미구현 |
| 사진 | 이 탭의 메모리. 서버 전송 없음 | 이 탭의 메모리. 서버 전송 없음 |
| 가족 확인 | 같은 탭의 시연용 역할 | 같은 탭의 시연용 역할 |
| 외부 AI·지도·예약·기기 간 초대 | 미연동 | 미연동 |

## 로컬에서 공개 빌드 확인

```powershell
python scripts/build_static.py
python -m http.server 8080 --bind 127.0.0.1 --directory dist
```

`http://127.0.0.1:8080/`에서 `공개 체험 · 가상 데이터` 표시를 확인한다. 공개 빌드는 API 상태 조회도 하지 않는다. 다시 빌드할 때는 기존 `dist` 출력 폴더를 먼저 지운다. 기본 로컬 API는 기존대로 `python -m backend.server`로 실행한다.

빌드는 정해진 HTML·JavaScript·CSS·가상 카탈로그와 Git으로 추적하는 허용 형식의 디자인·글꼴 자산만 복사한다. 데이터베이스, 업로드, 내부 문서와 추적하지 않는 사진은 배포 대상에 포함하지 않는다. 기존 출력 폴더가 비어 있지 않으면 덮어쓰지 않는다.

## GitHub Pages 최초 설정

Windows에서 이미 GitHub CLI(`gh`)에 로그인했다면 아래 스크립트로 Pages 설정과 최초 배포를 실행할 수 있다.

```powershell
git switch main
git pull --ff-only origin main
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\publish_demo.ps1 -Wait
```

스크립트는 `yurimakes/family-trip-planner`의 원격 main만 배포한다. Pages가 없으면 생성하고, 기존 게시 방식이 다르면 GitHub Actions로 변경한다. 관리자 권한이나 네트워크가 부족하면 중단하며 토큰을 출력하지 않는다. `-Wait`은 해당 신규 배포 실행의 검증·게시 성공과 실제 웹의 공개 모드 표시를 확인한 뒤 `Verified web demo`와 URL을 출력한다. 게시 성공 후에도 웹 접속 확인에 실패하면 검증 완료로 표시하지 않는다. 별도 `PUBLIC_DEMO_ENABLED` 변수 없이 최초 수동 배포를 실행한다.

브라우저 설정으로 진행할 수도 있다.

1. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택한다.
2. **Actions → Validate and publish demo → Run workflow**에서 **main**을 선택해 실행한다.
3. Windows·Linux 검증과 `Publish GitHub Pages`가 성공한 뒤 작업의 배포 URL을 연다.
4. URL에서 빠른 체험, 두 분 확인·일정 확정, 남은 일정 수정, 카드 PNG 저장을 확인한다.
5. 실제 접속이 확인되면 README 상단에 해당 URL을 추가한다.

기본 예상 주소는 `https://yurimakes.github.io/family-trip-planner/`이다. 실제 배포 결과의 URL을 기준으로 한다.

이후 main 변경을 자동 배포하려면 저장소 **Settings → Secrets and variables → Actions → Variables**에서 `PUBLIC_DEMO_ENABLED`를 `true`로 설정한다. 설정 전에는 PR·main 자동 검증만 실행하며 게시 작업을 건너뛴다. PR과 main 이외의 브랜치는 게시하지 않는다. 최초 배포 전에는 자동 게시를 기본으로 켜지 않는다.

## 자동 검증과 제한

`.github/workflows/public-demo.yml`은 Python 3.13·Node.js 22로 Windows와 Linux에서 소스 공개 검사, Python 테스트, JavaScript 테스트·구문 검사, 공개 빌드를 수행한다. 선택형 API 테스트를 위해 `requirements-dev.txt`를 설치한다.

정적 빌드 테스트는 저장소 하위 경로에서 디자인·글꼴·모듈·카탈로그가 제공되는지 확인한다. 공개 모드 UI 테스트는 역할 전환과 동의 전 확정 차단, 같은 일정 v1·v2 표시, API 요청이 없는지 확인한다. DOM 대체 객체를 사용하는 테스트이며 실제 모바일 브라우저·Web Share 실행 검증은 별도이다.

Windows 게시 스크립트 검사는 GitHub CLI와 웹 응답을 대체해 최초 설정·기존 설정·게시 방식 변경·인증 실패·권한 실패·실행 요청 실패·검증/배포 실패·실제 페이지 확인 실패의 8개 흐름을 검사한다. 테스트 중 실제 Pages 설정이나 게시 요청을 변경하지 않는다. 실제 배포 성공은 사용자의 인증된 실행 결과로 별도 확인한다.

Pages 구성은 GitHub 공식 [게시 방식 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)과 [사용자 정의 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)를 따른다. 개발용 Python 서버를 인터넷에 노출하는 배포는 포함하지 않는다.
