# 로컬 API

기본 실행 주소는 `http://127.0.0.1:8000`이다. JSON의 후보 ID와 익명 역할은 `web/catalog.json`, `web/planner.js`의 예시와 일치한다. 이 API는 로컬 개발용이다.

| Method | 경로 | 기능 |
| --- | --- | --- |
| GET | `/api/health` | 실행 모드와 AI 미연동 상태 |
| GET | `/api/catalog` | 가상 장소·이용 방식 |
| POST | `/api/compare` | draft를 검사하고 A·B안 반환, 저장 없음 |
| POST | `/api/trips` | draft 저장, ID·접근 토큰·revision 반환 |
| GET | `/api/trips/{id}` | 저장된 상태 조회 |
| PUT | `/api/trips/{id}` | draft 변경, 확정 초기화 |
| DELETE | `/api/trips/{id}` | 로컬 기록 삭제 |
| POST | `/api/trips/{id}/confirm` | 두 분 확인 후 서버에서 재검사·확정 |
| POST | `/api/trips/{id}/change` | 완료 구간 유지·남은 구간 수정 후 확정 |

저장된 여행의 조회·수정·삭제에는 생성 시 받은 값을 `X-Trip-Token` 헤더로 보낸다. 토큰은 URL 쿼리에 넣지 않는다. 토큰이 없거나 틀리면 404로 응답한다. 생성 시 반환한 토큰을 안전하게 보관하지 않으면 다시 조회할 수 없다.

## draft 예시

```json
{
  "candidates": ["tea", "fan", "rice", "market"],
  "responses": {
    "mom": {"tea": "yes", "fan": "yes", "rice": "yes", "market": "yes"},
    "dad": {"tea": "yes", "fan": "yes", "rice": "yes", "market": "yes"}
  },
  "essentials": {"mom": ["fan"], "dad": ["fan"]},
  "sources": {"mom": "direct", "dad": "direct"},
  "unknown_ids": [],
  "config": {
    "walk_limit": 1200,
    "continuous_limit": 300,
    "budget": 200000,
    "avoid_stairs": true,
    "mild_food": true
  }
}
```

응답 값은 `yes`, `no`, `skip`이다. 출처는 `direct`, `conversation`, `unconfirmed`이다. 미응답 키는 생략할 수 있지만 확정 조건을 충족하지 못한다. `unknown_ids`는 정보 누락을 재현하는 가상 데이터의 실험 입력이다. 실명·연락처·사진·비밀키 필드는 지원하지 않는다.

## 확정 요청

```json
{
  "expected_revision": 1,
  "plan_key": "B",
  "confirmations": {"mom": true, "dad": true}
}
```

서버가 저장된 draft로 다시 검사한다. 조건 위반·정보 누락·필수 경험 누락·확인 누락은 422, 오래된 revision은 409이다. `revision`과 일정 `version`은 다른 값이다.

## 남은 구간 수정

```json
{
  "expected_revision": 2,
  "completed_ids": ["rice"],
  "remaining_walk_limit": 300,
  "continuous_limit": 100,
  "confirmations": {"mom": true, "dad": true}
}
```

이 완료 목록은 B안의 점심이 먼저인 예시에 해당한다. 완료 목록은 기존 일정의 순서 있는 앞부분이어야 한다. 서버는 완료한 구간의 원래 시간·거리·이용 방식을 유지하고 남은 구간만 짧은 방식으로 계산한다. 보행 합계는 `completed_walk + remaining_walk`이며 하루 상한도 계속 적용된다.

확인 기록은 사용자가 입력한 시연 기록이다. 두 부모의 실제 신원을 인증하는 기능은 아직 없다.
