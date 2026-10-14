# Digital Tennis 온라인 매칭 서버

6자리 방 코드, 2인 방, WebSocket 시그널링, 릴레이를 담당하는 독립 제품 저장소입니다. 전체 프로젝트는 **외장 IMU를 별도로 부착한 NU40-DK**, Unity PC 게임, 1인 AI와 온라인 2인 대전을 12일·3명으로 개발합니다.

## 현재 상태

개발 계획과 초기 문서가 준비된 단계입니다. 제품 코드는 아직 구현되지 않았습니다. 실행 명령은 D1 도구 선택과 실제 구현 뒤에 추가합니다. 모의 입력으로 먼저 검증하고 실물/다른 제품과 통합합니다.

## 개발할 기능과 제출 기준

[초보 개발자용 상세 과제](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md)에서 상황·입력·출력·예제·예외·완료 기준을 확인합니다.

- [MS-01 6자리 방 코드와 2인 방 관리](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-01)
- [MS-02 WebSocket 요청과 응답 및 검증](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-02)
- [MS-03 P2P 연결 정보 시그널링](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-03)
- [MS-04 릴레이와 전송 모드 합의](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-04)
- [MS-05 heartbeat와 재접속 유예 및 종료 정리](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-05)
- [MS-06 서버 실행과 배포 및 운영 확인](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/products/digital-tennis-match-server.md#ms-06)

## 개발 환경과 예상 구조

초기 담당 역할은 C / A 검토입니다. 실제 IMU·배선·펌웨어 SDK·Unity·Windows·런타임 버전은 D1에 [환경표](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/project/overview.md)와 결정 기록에 남깁니다.

예상 폴더는 `src/rooms/ · src/signaling/ · src/relay/ · tests/`입니다. 아직 존재하지 않는 폴더와 실행 명령을 구현 완료로 해석하지 않습니다. 채택 도구와 실제 구현에 맞게 갱신합니다.

## 검증과 협업

- [12일 WBS](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/planning/wbs.md)
- [컨트롤러 계약](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/contracts/controller-protocol.md)
- [온라인 계약](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/contracts/online-protocol.md)
- [수용 테스트](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/testing/acceptance.md)
- [브랜치·PR 작업 방법](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/guides/contributing.md)
- [모든 제품과 의존 관계](https://github.com/digital-tennis/digital-tennis-docs/blob/main/docs/project/repositories.md)

라이선스는 코드와 제3자 자산 조건을 검토한 뒤 팀이 선택합니다.
