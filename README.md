# Digital Tennis · 온라인 매칭 서버

두 플레이어를6자리 방 코드로 연결하고 WebSocket 시그널링·릴레이·재접속 상태를 관리한다.

전체 제품은 NU40-DK에 **별도 외장 IMU**를 부착하는 라켓 컨트롤러와 Unity PC 테니스 게임으로 구성한다. 최초 계획은 **12일·3명**이다.

## 주요 기능

- 최대2인 방·방 코드 충돌/만료·입력 검증
- WebRTC offer/answer/ICE 전달과 epoch 기반 릴레이 합의
- heartbeat·재접속 토큰 교체·방 격리

## 빠른 시작

Node.js22 이상, npm. 인터넷 연결은 TLS 프록시와 접근 가능한 wss 주소가 필요하다.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm start
```

## 책임과 현재 범위

기본 ws://127.0.0.1:8080/ws, /health로 상태 확인. Unity가 직접 DataChannel을 협상하고 실패 시 릴레이를 선택한다. 서버는 IMU/BLE·공 물리·타격·점수를 계산하지 않는다. 같은 Mac2프로세스 검증과 두 PC/WAN 실기는 구분한다.

## 구조와 문서

`src/`: 서버/메시지 검증 · `tests/`: 단위/실소켓 검사 · `deploy/`: 배포 예제 · `.env.example`: 설정 예시

[온라인 계약](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/contracts/online-protocol.md), [환경 예제](.env.example)

## 도움말과 기여

재현 가능한 문제는 [이슈](https://github.com/digital-tennis/digital-tennis-match-server/issues)로 남긴다. 관리 주체는 [Digital Tennis](https://github.com/digital-tennis)이며 [기여 안내](CONTRIBUTING.md)를 따른다. 검증 커밋을 고정하고 실제 장치 성공·모의 검사·교차 빌드를 구분한다.

## 라이선스

프로젝트 자체 코드·문서는 **[Apache-2.0](LICENSE)**이다. [NOTICE](NOTICE)와 [외부 코드·자산 고지](THIRD_PARTY_NOTICES.md)를 함께 확인한다. 외부 자산에 Apache-2.0을 덮어쓰지 않는다.
