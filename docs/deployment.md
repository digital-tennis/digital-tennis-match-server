# 로컬 검증과 공용 WSS 운영

게임의 방 생성·입장·heartbeat·시그널링은 WebSocket 제어 연결을 유지한다. 실제 DataChannel이 열리면 p2p 모드를 양측 합의한 뒤 게임 데이터만 직접 전송한다. 초기8초 탐색 실패는 relay 합의로 전환한다. 직접 연결 중 실패를 `peer.failed`로 알리면 서버가 새 epoch의 relay 협의를 시작한다. 직접 모드에서 `game.relay`는 거부되므로 실제 전송과 표시가 섞이지 않는다. 호스트만 공·규칙·점수를 소유한다.

## 배포 구성

`TENNIS_DOMAIN=owned.example docker compose -f deploy/compose.yaml up --build -d`로 실행할 수 있는 구성을 제공한다. 실제 소유 도메인과 DNS·80/443 인바운드·인증서 발급이 필요하다. Caddy는 공개TLS와 WebSocket upgrade를 처리하며 내부 match:8080만 사용한다. 외부에는80/443만 공개하고 Node는non-root/read-only로 실행한다. 환경별 값·인증서·로그·node_modules는 Git에 넣지 않는다.

게임 주소는 `wss://실제도메인/ws`, 상태 확인은 `https://실제도메인/health`이다. 예시 주소는 운영 완료 URL이 아니다. TLS 인증서 검증을 해제하거나 재접속 토큰을 URL에 넣지 않는다. `/health`는 연결·방·릴레이 수만 제공하며 코드·토큰을 노출하지 않는다. 로그의 예상치 못한 오류는 예외 이름만 기록한다.

서버는 메모리에 방을 유지하므로 재시작 시 방이 사라진다. 롤링 재시작·호스트 이전·계정·랭킹은 지원하지 않는다. 새 접속을 줄이고 진행 중인 방이 끝난 후 배포하며, 강제 재시작 시 클라이언트가 종료 안내 후 새 방을 만들도록 안내한다. 연결수·방수·오류율·메모리와 인증서 갱신을 운영자가 관찰한다. 단일 컨테이너의 검증 수치를 모든 인터넷 환경의 수용량으로 표시하지 않는다.

## 재현

```sh
npm ci
npm run check
npm test
node tools/load-check.mjs 8 5
TENNIS_DOMAIN=owned.example docker compose -f deploy/compose.yaml config
```

load-check는8개 방·16개 실제 WebSocket 클라이언트로 입력 중계·지연·누락·자원 정리를 검사한다. 합성 메시지이므로 Unity 랠리·득점 증거는 게임 저장소의 실제 두 클라이언트 실행으로 별도 남긴다. 실물Windows/서로 다른 두PC·WAN은 유예다. 실제 도메인/호스팅 계정 연결과 공용 인증서 발급은 계정 의존 단계이며 로컬 검증으로 완료 처리하지 않는다.
