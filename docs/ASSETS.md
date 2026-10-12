# 디자인 자산

| 자산 | 용도 | 상태 |
| --- | --- | --- |
| `web/assets/design/design-01.png` | 후보 준비·사진 선택의 확정 UI 디자인 | 디자인 예시. 실제 장소 검증 자료가 아님 |
| `web/assets/design/design-02.png` | 대안 비교·변경 확인의 확정 UI 디자인 | 수치는 화면 설계 예시 |
| `web/assets/design/design-03.png` | 여행 소개·추억 카드의 확정 UI 디자인 | 가족 사진·AI 캐릭터는 디자인 예시이며 API 변환 결과가 아님 |
| `web/assets/fonts/SUIT-Variable.woff2` | 앱의 로컬 한글 글꼴 | 공식 SUIT 배포 파일, 수정 없이 포함 |
| `web/assets/fonts/OFL.txt` | 글꼴 저작권·라이선스 고지 | 공식 라이선스 원문 |

확정 디자인 PNG는 제공된 파일 그대로 사용하며, EXIF·텍스트 메타데이터가 없는 것을 확인했다. 앱에서 한옥 카페와 풍경 사진 영역은 원본 PNG를 SVG 뷰포트로 표시한다. 전체 PNG를 수정하거나 사진의 실제 장소 정보를 추정하지 않는다.

글꼴 출처: https://github.com/sun-typeface/SUIT/blob/main/fonts/variable/woff2/SUIT-Variable.woff2

공식 글꼴의 Git blob SHA: `89d7e4c28fe8069a8110a79dc7ca3cd446745de9`.

디자인 예시 이미지 안의 확인일·거리·장소 수와 실행 코드의 가상 데이터는 구분한다. 코드의 일정 조건과 비용·보행 값은 검사 엔진의 계산 결과를 표시한다. AI 캐릭터 변환은 후속 연동이며 현재 카드에는 기본 캐릭터임을 표시한다.
