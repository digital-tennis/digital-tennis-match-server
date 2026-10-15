# Digital Tennis 온라인 매칭 서버

6자리 방 코드, 2인 방, WebSocket 시그널링, 릴레이를 담당하는 독립 제품 저장소입니다. 전체 프로젝트는 **외장 IMU를 별도로 부착한 NU40-DK**, Unity PC 게임, 1인 AI와 온라인 2인 대전을 12일·3명으로 개발합니다.

## 실행

Node.js 22 이상이 필요합니다. 현재 Mac 검증 환경은 Node 25.2.1, 의존성은 ws 8.22.0입니다.

```sh
npm ci --ignore-scripts
npm start
# 다른 터미널에서
curl http://127.0.0.1:8080/health
npm test
```

기본 주소는 `ws://127.0.0.1:8080/ws`입니다. Unity의 온라인 패널에서 한 사람이 Create room으로 만든 6자리 코드를 다른 사람이 Join room에 입력합니다. 두 PC가 같은 LAN에 있다면 `HOST=0.0.0.0 npm start`로 실행하고 양쪽에서 서버 Mac의 LAN 주소를 입력합니다. 인터넷 배포에는 TLS 종료 프록시와 `wss://`가 필요하며 이번 작업에서 공용 서버를 배포하지 않습니다. `.env.example`은 참고용이며 자동 로딩하지 않습니다.

## 구현한 동작

- 혼동되는 문자를 제외한 암호학적 난수 6자리 코드, 최대 2명, 중복 입장/3번째 참가 거부, 대기 10분 만료.
- JSON v1 봉투, 요청 ID 응답, 16KiB 제한, 숫자/좌표/스윙 범위 검사, 소켓별 초당 60개·burst 120개 및 생성/입장 30초당 5회 제한.
- 같은 방의 offer(호스트), answer(게스트), ICE 교환. SDP는 `{type, sdp}`, ICE는 `{candidate, sdpMid?, sdpMLineIndex?}`입니다.
- host propose → guest ack → host commit 후 양쪽에 committed. epoch와 역할이 맞는 메시지만 중계합니다.
- 게스트의 정규화 입력 → 호스트, 호스트의 상태/결과/일시정지 → 게스트. 게스트가 점수나 결과를 발행할 수 없습니다.
- 5초 간격 클라이언트 heartbeat, 15초 무응답 종료, 끊긴 역할에 15초 재접속 유예, 토큰 교체, 새 epoch 합의, 유예 만료/명시적 퇴장 정리.
- `/health`는 연결·방·중계 수만 반환하며 토큰은 노출하지 않습니다. 서버 재시작은 방을 초기화합니다. 호스트 이전은 지원하지 않습니다.

Unity는 현재 **WebSocket relay**를 명시적으로 선택합니다. 실제 WebRTC DataChannel, 8초 P2P 탐색 후 자동 전환 및 TURN은 아직 구현하지 않았습니다. 시그널링 전달 테스트와 직접 P2P 연결 성공은 구분합니다.

## 메시지와 책임

[온라인 계약](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/contracts/online-protocol.md)을 따르며, 타격 문맥을 위해 입력에 `rallyId`, `shotId`를 추가합니다. 상태는 `matchId`, `shotId`, `hits/nearHits/farHits/forehandHits/backhandHits`, `hitReady`, `status`도 전달합니다. phase는 Unity 열거형 이름 `WaitServe/InFlight/Rally/PointEnd/MatchEnd`입니다. 서버가 공을 계산하거나 입력을 타격 성공으로 판정하지 않습니다.

```json
{"v":1,"type":"room.create","requestId":"r1","payload":{}}
```

게임 릴레이는 `payload: {epoch, message}`이며 내부 message는 `v/type/epoch/payload`를 가집니다. 입력에는 `inputSeq/playerId=guest`, 상태에는 `tick`을 추가합니다. 서버 알림의 requestId는 null입니다. 알려지지 않은 추가 필드는 권한에 영향을 주지 않으며, 사용되는 모든 필드는 검사합니다. 입력 순번 중복 제거와 스냅샷 순서 검사는 Unity에서 처리합니다.

`src/protocol.js`는 봉투/게임 필드 검사, `src/rooms.js`는 방 수명/권한/전송 합의, `src/server.js`는 HTTP/WebSocket 실행입니다. [ws 공식 문서](https://github.com/websockets/ws)를 사용하며 압축은 끕니다. 큐가 느린 소켓의 송신 버퍼가 256KiB를 넘으면 종료하여 다른 방이 밀리지 않게 합니다.

## 검증

`npm test`는 단위 테스트와 실제 WebSocket 두 클라이언트 통합 테스트 15개를 실행합니다. 코드 충돌 10회, 만료/정리, 잘못된 JSON·범위, 권한 위조, 방 격리, 전송 합의, 릴레이, 재접속 토큰 교체를 확인합니다. CI도 Node 22에서 같은 검사를 수행합니다. Unity 실행 증거와 두 PC 검증 범위는 게임 저장소 README에 기록합니다.

## 개발할 기능과 제출 기준

[초보 개발자용 상세 과제](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md)에서 상황·입력·출력·예제·예외·완료 기준을 확인합니다.

- [MS-01 6자리 방 코드와 2인 방 관리](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-01)
- [MS-02 WebSocket 요청과 응답 및 검증](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-02)
- [MS-03 P2P 연결 정보 시그널링](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-03)
- [MS-04 릴레이와 전송 모드 합의](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-04)
- [MS-05 heartbeat와 재접속 유예 및 종료 정리](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-05)
- [MS-06 서버 실행과 배포 및 운영 확인](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-06)

## 개발 환경과 구조

초기 담당 역할은 C / A 검토입니다. `src/`에 실행 코드, `tests/`에 Node 테스트가 있습니다. 실물 IMU·배선과 펌웨어 SDK는 컨트롤러 작업에서 별도로 결정합니다.

## 검증과 협업

- [12일 WBS](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/planning/wbs.md)
- [컨트롤러 계약](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/contracts/controller-protocol.md)
- [온라인 계약](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/contracts/online-protocol.md)
- [수용 테스트](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/testing/acceptance.md)
- [브랜치·PR 작업 방법](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/guides/contributing.md)
- [모든 제품과 의존 관계](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/project/repositories.md)

라이선스는 코드와 제3자 자산 조건을 검토한 뒤 팀이 선택합니다.
