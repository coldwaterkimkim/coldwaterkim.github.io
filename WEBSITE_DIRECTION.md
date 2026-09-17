# 사이트 최상위 철학서 · 2026.09.17

이 문서는 제품 목적, 정보 구조, 경험과 디자인에 관한 가장 높은 프로젝트 기준이다. 현재 사용자 지시가 우선하며, 다른 프로젝트 문서와 충돌하면 이 문서를 따른다. 운영·보안·데이터 보존 규칙은 별도로 유지한다.

2026-09-16 통합 원문은 아래에 보존한다. 이후 사용자 결정은 다음 갱신 절에 기록하며, 원문의 같은 항목보다 우선한다. 핵심 목적과 경험 철학은 유지한다. 구현 상태와 검증 증거는 STATUS.md와 design-qa.md에서 구분한다.

- 구현 연결 기준: [design.md](design.md)
- 새 방향 검토 기준: [design-qa.md](design-qa.md)
- 대체된 레트로 문서와 기념 기록: [heritage/2026-09-16-retro](heritage/2026-09-16-retro/README.md)

## 2026-09-17 확정 결정과 현재 기준

첫 Sketchbook + Crayon 화면을 사용자 승인으로 공개 배포했다. 이 화면을 다음 iteration의 출발점으로 삼는다. 배포 승인은 원문의 모든 가설을 확정하거나 모든 요구의 구현 완료를 뜻하지 않는다.

### 홈과 탐색

- 홈은 계속 “어디를 볼지 고르는 곳”이며, 기본 화면은 스크롤 없이 헤더·탐색 메뉴·음악 플레이어가 한 화면에 들어간다. 하위 페이지는 콘텐츠 길이에 따라 스크롤한다.
- 공통 상단 내비게이션은 sticky다. 브랜드는 `콜드워터킴`, 링크는 `홈 / 전체 보기 / 앨범`이다. `목차`와 홈 본문의 중복 전체 보기·앨범 입구는 제거한다.
- 홈의 주요 입구는 `나으 생각`, `나으 하루`, `내가 만든 것들`, `나를 사로잡은 것들`이다. 뒤의 두 표현은 홈 표시명이며 목적지 분류 `나으 만듦`, `나사잡`을 대체하지 않는다.
- `방명록!`과 `about me`는 사용자 글씨체의 검은 텍스트로 표시한다. 주요 메뉴, 공통 탐색, 사람과 방문자의 관계라는 역할 구분은 유지한다.
- 원문 16절의 중앙 구조/주변 존재감은 가능한 가설로 남긴다. 현재 승인 화면은 주요 메뉴 아래에 음악 플레이어를 두며 주변부 배치를 의무화하지 않는다.

### 표현과 하위 페이지

- 크레파스는 홈과 시각적 위계가 높은 부분에 집중한다. 본문과 일반 UI는 사용자의 `김찬수싸구려볼펜체`를 사용하며, 크레파스를 모든 글자·요소에 반복하지 않는다. 읽기 편함이 기준이다.
- 현재 화면의 흰 바탕·파란 크레파스·검은 일반 글씨를 첫 배포 기준으로 삼는다. 전체 색상·타이포그래피 시스템이 영구 확정된 것은 아니다.
- 전체 보기·나으 하루는 본문을 읽는 피드, 나으 생각·나으 만듦은 요약을 보고 상세로 들어가는 목록이다.
- 나사잡은 감상 텍스트 위/사진·영상 아래의 이미지 중심 피드다. 앞선 C 요약 목록 선택은 본 대상에 집중한다는 후속 결정으로 대체했다.
- 앨범은 기존 분류와 사진/영상 형식 필터를 유지한다. 페이지당 최대 24개, 3열 × 8행 정방형 크롭이며, 영상도 목록에서는 플레이어 대신 썸네일을 보여준다. 마지막 페이지는 남은 개수만 표시한다.
- 음악 플레이어의 재생·셔플·제목 테두리는 손으로 남긴 거친 느낌을 유지한다. 음악/무음 동의와 재생 동작은 기존 기능을 따른다.

### 보존과 다음 iteration

- 이번 전환은 기존 사이트의 외형을 바꾸는 작업이다. 기록·복잡한 본문·미디어·분류·URL·편집·방명록·음악의 기존 로직과 데이터를 재사용한다. about me의 실제 소개·사진·외부 계정 링크도 보존한다.
- 프로필 사진·기본 정체성과 `요즘에는`의 홈 배치는 보류다. 원문 15절의 요구는 폐기하지 않았지만 이번 홈에는 아직 반영하지 않았다. 다음 iteration에서 배치를 논의한다.
- 기록 사이 연결, 우연한 발견 장치, 랜덤 기록 입구는 계속 열린 선택이다. 현재 배포가 이 기능들의 채택을 뜻하지 않는다.
- 다음 작업은 실제 사용을 바탕으로 가독성·여백·반응형·물성 표현과 남은 요소를 다듬는 것이다. 새 요구 없이 WHY나 metaphor를 다시 정의하지 않는다.

## 2026-09-16 통합 원문

---

coldwaterkim.com
Website Direction & Information Architecture

Current consolidated version · 2026.09.16

1\. 프로젝트 개요

coldwaterkim.com은 김찬수 개인의 삶과 생각, 일상, 창작물, 관심사, 사진과 영상 등을 장기간 축적하는 personal life archive다.

이 사이트의 primary audience는 불특정 다수가 아니라 미래의 나 자신이다.

수십 년 뒤 과거의 기록을 다시 들여다보거나, 가족과 함께 당시의 생각과 생활을 돌아볼 수 있는 개인 기록 저장소가 가장 근본적인 목적이다.

동시에 이 기록을 공개함으로써 다른 사람도 김찬수라는 사람을 알아갈 수 있다.

따라서 이 사이트는 다음과 같은 성격과는 구별된다.

portfolio
personal branding website
SNS replacement optimized for engagement
audience growth media
성과와 완성된 결과물만 선별한 showcase

사이트는 살아가며 남겨진 것들을 축적하는 장소에 가깝다.

2\. 핵심 목적

사이트의 목적은 기록을 잘 포장하여 방문자에게 김찬수를 설명하는 것이 아니다.

오히려 방문자가 다양한 기록을 자기 방식대로 들여다보면서,

“얘한테 이런 면도 있었네.”

라고 느끼게 만드는 것이 중요하다.

즉 방문자는 정보를 전달받는 관객이라기보다,

한 사람의 흔적을 직접 뒤적이며 그 사람을 알아가는 사람

에 가깝다.

이를 한 문장으로 정리하면 다음과 같다.

coldwaterkim.com은 김찬수가 살아가며 남긴 흔적을 축적하고, 다른 사람이 그 흔적 사이를 자유롭게 돌아다니며 김찬수라는 사람을 스스로 발견하게 만드는 개인 아카이브다.

3\. 핵심 경험

사이트에서 추구하는 experience는 self-directed discovery다.

방문자에게 김찬수를 하나의 완성된 narrative로 설명하기보다 여러 fragment를 제공한다.

예를 들어,

어떤 사진을 본다.

→ 그날 기록한 글을 발견한다.

→ 다른 기록에서 같은 사람이나 장소가 등장한다.

→ 당시 만들던 프로젝트를 발견한다.

→ 한동안 반복해서 등장하던 관심사를 발견한다.

→ 방문자가 스스로 당시의 김찬수를 구성한다.

여기서 핵심은 정보가 숨겨져 있느냐가 아니다.

fragment 사이의 관계를 사용자가 직접 발견한다는 것이다.

따라서 현재 중요하게 보고 있는 discovery loop는 다음과 같다.

눈에 걸림 → 열어봄 → 뜻밖의 면을 발견함 → 다른 것이 궁금해짐 → 또 다른 흔적으로 이동함

이 flow 자체는 중요한 working hypothesis이지만, 구체적인 UI mechanic은 아직 고정하지 않는다.

4\. “친구 방을 뒤져보는 느낌”의 의미

초기 metaphor는 다음과 같았다.

친구 집에 놀러 가서 그 사람의 책꽂이, 책상, 서랍, 노트북 등을 자연스럽게 구경하는 경험.

하지만 이 metaphor를 literal하게 UI로 구현하지 않는다.

즉 다음과 같은 것을 굳이 사용할 필요는 없다.

실제 방 UI
서랍
잠금장치
숨겨진 폴더
비밀 문서
침투 단계
방 주인 부재 countdown
흔적 게이지
특정 시간에만 열리는 콘텐츠

이러한 장치는 visitor를 자연스럽게 발견하는 사람에서 게임을 플레이하는 사용자로 바꿔버릴 위험이 있다.

따라서 “친구 방”은 visual metaphor가 아니라 experience principle로 사용한다.

그 본질은 다음과 같다.

주인이 정리해서 보여주는 설명을 따라가는 것이 아니라, 그 사람이 남겨놓은 여러 흔적 중 자신이 관심 가는 것을 골라보며 그 사람을 알아가는 경험.

5\. Archive와 Discovery

이 프로젝트에는 서로 다른 두 요구가 동시에 존재한다.

Archive

미래의 내가 수십 년 동안 계속 사용해야 한다.

따라서 다음이 중요하다.

명확한 구조
검색 가능성
날짜
카테고리
predictable navigation
높은 readability
장기적인 유지 가능성
Discovery

외부 방문자는 기록을 탐색하면서 김찬수를 발견해야 한다.

따라서 다음도 중요하다.

serendipity
예상하지 못한 연결
personality
imperfect traces
curiosity
우연히 발견하는 순간

Archive만 극단적으로 추구하면 정돈된 블로그가 되고,

Discovery만 추구하면 한 번 구경하고 끝나는 experimental website가 된다.

coldwaterkim.com은 둘 사이의 balance를 지향한다.

이를 감각적으로 표현하면 다음과 같다.

아는 맛인데, 먹다 보면 예상하지 못한 킥이 있는 사이트.

기본적인 navigation convention은 유지하되, 그 안에서 coldwaterkim만의 예상치 못한 순간이 나타나야 한다.

6\. 콘텐츠에 대한 기본 철학

사이트에 올라가는 기록은 성공하거나 의미 있는 것만 선별하지 않는다.

대상에는 다음이 모두 포함될 수 있다.

생각
고민
삽질
일상
개똥철학
유머
창작
프로젝트
실패한 것
좋아했던 것
사진
영상
당시 몰입했던 대상
시간이 지나면서 바뀐 생각

따라서 사이트는 완성된 결과물의 전시장보다,

살아가면서 계속 무언가를 남기는 surface

에 가깝다.

7\. 핵심 시각 컨셉

현재 visual concept은 확정되었다.

Sketchbook + Crayon

사이트는 디지털 환경에서 동작하지만, 전달되는 기록에는 가능한 한 physical materiality를 느끼게 한다.

그 이유는 물성이 주는 다음의 감각을 중요하게 보기 때문이다.

warmth
sincerity
intimacy
흔적
인간이 실제로 손을 댄 것 같은 감각

따라서 coldwaterkim.com의 시각적 thesis는 다음과 같다.

Physical warmth, digital usability.

또는 더 직접적으로 말하면,

Structure is digital. Surface is physical.

사이트의 interaction, responsive behavior, clickable area, accessibility 같은 부분은 현대적인 웹 기준으로 정확하게 작동한다.

그러나 화면 위의 표현은 손으로 직접 쓰고, 그리고, 붙이고, 남긴 듯한 physical character를 가진다.

8\. 스케치북의 의미

스케치북은 단순한 visual theme가 아니다.

빈 종이는 특정 형태의 output을 강제하지 않는다.

그 위에서 사람은

글을 쓰고
그림을 그리고
사진을 붙이고
계산하고
낙서하고
무언가를 설계하고
실패하고
지우고
다시 시작한다.

이 특성이 김찬수에게 중요한 creation이라는 개념과 연결된다.

따라서 visual direction의 근본은 다음에 있다.

Creation begins on an empty surface.

페이지는 완성된 잡지보다는 계속 사용되고 있는 스케치북처럼 느껴질 수 있다.

9\. Crayon의 의미

Crayon은 단순히 귀여운 그림체를 만들기 위한 선택이 아니다.

중요한 것은 다음과 같은 material properties다.

stroke가 균일하지 않음
pressure variation
pigment가 완전히 채워지지 않음
종이 texture가 stroke 사이로 드러남
완벽하게 정렬되지 않은 인간적인 mark
손의 움직임이 그대로 남은 느낌

따라서 디자인의 목표는 crayon-themed UI가 아니라,

사람이 직접 흔적을 남기고 있는 것처럼 느껴지는 UI

다.

10\. 피해야 할 시각적 함정

Sketchbook + Crayon은 조금만 과하면 흔한 scrapbook aesthetic이 되기 쉽다.

따라서 다음과 같은 요소를 자동적으로 남발하지 않는다.

테이프, 찢어진 종이, paper clip, post-it, polaroid, 별 낙서, 고양이 낙서, 커피잔, 여러 색의 크레파스 border 등을 화면마다 장식처럼 반복하는 방식은 피한다.

특히 목표는 다음이 아니다.

“Everything is a cute piece of paper.”

모든 navigation을 각각 카드나 sticky note로 만들 경우 사이트가 금방

SaaS dashboard but make it crayon

처럼 보일 수 있다.

물성은 component skin이 아니라 전체 composition과 surface에서 느껴져야 한다.

11\. 현재 Information Architecture

현재 사이트의 major destination은 8개다.

이름	역할
전체 보기	모든 기록을 category 구분 없이 보는 곳
나으 생각	생각, 글, 고민, 끄적임
나으 하루	일상과 생활 기록
나으 만듦	프로젝트, 창작, 만든 것과 만드는 과정
나사잡	나를 사로잡은 것들, 좋아하고 관심 가졌던 대상
앨범	사진과 영상 중심의 기록
방명록	방문자가 흔적을 남기는 공간
about me	김찬수에 대한 기본적인 소개

이 명칭은 현재 기준이다.

기존의 글방은 나으 생각으로,

프로그램실은 나으 만듦으로 변경되었다.

이 변경은 naming consistency를 높이기 위한 것이다.

12\. 콘텐츠 taxonomy에 대한 원칙

글 / 사진 / 영상 자체를 primary taxonomy로 사용하지 않는다.

그것들은 format이다.

primary taxonomy는

김찬수라는 사람의 어떤 면을 보고 있는가

를 중심으로 한다.

따라서 하나의 게시물은 사진이 포함되어 있어도 나으 하루에 속할 수 있고,

영상이어도 나으 만듦이나 나사잡에 속할 수 있다.

이때 앨범은 subject taxonomy라기보다 media-oriented lens 역할을 한다.

13\. 8개 메뉴의 구조적 위계

현재 가장 자연스러운 구조는 4 + 2 + 2다.

Primary

김찬수의 삶과 정체성의 주요 영역.

나으 생각
나으 하루
나으 만듦
나사잡

이 네 항목은 같은 질문에 답한다.

김찬수의 어떤 면을 들여다볼 것인가?

따라서 homepage navigation의 중심이 된다.

Secondary

동일한 기록을 다른 방식으로 보는 lens.

전체 보기
앨범

전체 보기는 category가 아니라 archive-wide view다.

앨범은 subject가 아니라 media-oriented view에 가깝다.

따라서 primary 4개와 동일한 weight로 취급하지 않는다.

Tertiary

archive 자체가 아니라 사람과 방문자의 관계를 담당한다.

about me
방명록

about me는 identity information,

방명록은 visitor interaction을 담당한다.

14\. 홈페이지의 역할

홈페이지의 역할은 이미 결정되어 있다.

홈페이지는 “어디를 볼지 고르는 곳”이다.

따라서 homepage 자체가 chronological feed나 전체 archive가 되지는 않는다.

홈에 들어온 사용자는 페이지 전체를 읽은 뒤 콘텐츠로 이동하는 것이 아니라,

어느 방향으로 탐색할지를 선택한다.

그렇기 때문에 현재의 8개 destination은 홈페이지에서 모두 discoverable하게 만드는 쪽이 적절하다.

단, 8개를 같은 시각적 weight로 보여주지는 않는다.

15\. 홈페이지에 반드시 존재할 요소

navigation 이외에 homepage에는 다음 세 요소가 필수다.

Profile
프로필 사진
기본적인 profile identity
요즘에는

현재 김찬수의 상태나 근황을 짧게 보여주는 mutable profile text.

이 영역은 사이트에 현재성을 만든다.

오래된 기록이 쌓여 있더라도 방문자는

“지금 이 사람은 이렇구나.”

를 알 수 있다.

Music Player

현재 사이트에서 제공하고 있는 음악 player.

이는 단순 utility가 아니라 공간의 ambient layer 역할도 한다.

16\. 홈페이지 composition에 대한 현재 유력한 방향

아직 layout은 확정하지 않았다.

다만 현재 가장 유력한 structural hypothesis는 다음과 같다.

중앙에는 navigation이라는 안정적인 구조가 존재하고, profile / 요즘에는 / music player 같은 개인적 요소는 주변부에 보다 자유롭게 존재한다.

즉,

center = structure

periphery = presence

라는 관계다.

중앙에서는 사용자가 어디로 갈지 명확하게 결정할 수 있고,

주변을 보면 이 공간을 실제로 사용하고 있는 사람의 존재가 느껴진다.

이때 주변 요소는 실제로 random한 위치에 두는 것이 아니라,

controlled chaos

원칙을 사용한다.

겉으로는 자연스럽고 약간 어긋나 보여도 실제 layout 아래에는 정교한 grid와 responsive logic이 존재한다.

따라서:

Looks messy, behaves clean.

이 원칙이 중요하다.

단, 이 composition 자체는 아직 채택된 layout은 아니다.

17\. Serendipity에 대한 현재 방향

홈페이지는 navigation 기능을 우선한다.

따라서 홈에서 지나치게 많은 콘텐츠 preview를 제공하거나 feed처럼 만들 필요는 없다.

다만 discovery를 돕기 위해 다음과 같은 작은 장치는 향후 사용할 수 있다.

예를 들어:

category 주변에 실제 기록의 한 조각이 보임
최근 기록 일부가 자연스럽게 끼어 있음
서로 관련 있는 기록 사이에 connection 제공
archive에서 random record를 보여주는 작은 entrance

특히 다음과 같은 interaction은 현재 철학과 잘 맞는다.

아무거나 하나 꺼내보기

이는 “친구 방을 뒤져본다”는 metaphor를 거대한 game mechanic 없이도 구현할 수 있다.

다만 이것 역시 현재 필수 기능으로 확정된 것은 아니다.

18\. 디자인에서 유지해야 할 원칙
Familiar first, surprise second

기본적인 navigation은 익숙하게 만든다.

사용자는 링크가 무엇인지, 어디를 클릭해야 하는지 즉시 이해할 수 있어야 한다.

그 위에 coldwaterkim만의 personality를 얹는다.

Physical expression, digital behavior

표현은 handmade여도 interaction까지 handmade처럼 불편해서는 안 된다.

hit area, hover, keyboard navigation, mobile layout, loading behavior 등은 일반적인 좋은 웹 UI처럼 작동해야 한다.

Imperfection without sloppiness

삐뚤어진 글씨와 불균일한 stroke는 의도된 표현이다.

정보 구조까지 삐뚤어져서는 안 된다.

Archive first

사이트는 한 번 만들고 끝나는 art piece가 아니다.

수년 혹은 수십 년 동안 기록이 계속 추가될 수 있어야 한다.

콘텐츠 하나를 올릴 때마다 별도의 연출을 추가해야 유지되는 구조는 피한다.

Leave room for life

홈페이지를 완전히 채워버리지 않는다.

스케치북의 중요한 특징 중 하나는 빈 공간이다.

빈 곳은 미완성처럼 보이는 것이 아니라,

앞으로 무언가가 더 생길 수 있는 공간

으로 기능한다.

19\. 폐기하거나 우선 배제한 방향

현재 기준으로 다음 아이디어는 project direction에서 멀어진 것으로 본다.

literal room interface
drawer interaction
secret/private layer
intrusion mechanic
countdown
guilt mechanic
모든 기록의 front/back 이중 작성
OS desktop/window UI
infinite 2D canvas
탐색 자체를 game처럼 만드는 구조
디자인 gimmick을 중심으로 한 homepage
기존 4개 메뉴를 고정된 2×2 card grid로 두는 것
모든 메뉴를 독립적인 paper card로 표현하는 것

이 중 일부 visual element가 개별적으로 사용될 가능성까지 배제하는 것은 아니지만, 사이트의 macro structure로 사용하지 않는다.

20\. 현재 확정된 것과 열린 것
항목	상태
개인 life archive라는 목적	확정
미래의 내가 primary audience	확정
공개 archive	확정
self-directed discovery	확정
친구 방 metaphor는 literal하게 구현하지 않음	확정
Sketchbook + Crayon	확정
physical warmth + digital usability	확정
홈페이지 = 탐색 방향을 선택하는 곳	확정
나으 생각 / 나으 하루 / 나으 만듦 / 나사잡	확정
전체 보기 / 앨범 / 방명록 / about me	현재 IA
4 + 2 + 2 hierarchy	유력한 구조 원칙
profile photo / 요즘에는 / music player 포함	확정
navigation 중앙 + personal elements 주변	유력한 layout hypothesis
category별 실제 기록 preview	열림
아무거나 하나 꺼내보기	열림
desktop 정확한 spatial composition	열림
mobile composition	열림
각 category의 visual representation	열림
color system	열림
typography system	열림
crayon 사용 강도	열림
album / 전체 보기의 정확한 placement	열림
homepage 이후 archive/list/detail 구조	열림
21\. 현재의 디자인 문제

현재 다시 WHY를 정의하거나 새로운 metaphor를 찾을 필요는 없다.

지금 풀어야 할 문제는 훨씬 구체적이다.

8개의 destination을 어떻게 하나의 홈페이지 위에 배치하면, 구조는 즉시 이해되면서도 그 화면 자체가 김찬수가 실제로 사용하고 있는 스케치북처럼 느껴질 것인가?

조금 더 쪼개면 세 가지다.

Information hierarchy
무엇을 먼저 보게 할 것인가.

Spatial composition
각 요소가 화면에서 어떤 관계를 맺을 것인가.

Material expression
그 구조를 어떤 physical mark와 surface로 표현할 것인가.

이 세 가지 순서가 중요하다.

crayon color나 tape texture부터 결정하는 게 아니라,

hierarchy → composition → material styling

순으로 진행한다.

22\. 현시점의 한 문장 Design Brief

coldwaterkim.com은 빈 스케치북 위에 한 사람이 살아가며 남긴 생각, 일상, 창작, 취향과 이미지가 계속 축적되는 개인 아카이브다. 방문자는 익숙한 웹의 사용성을 잃지 않은 채 그 흔적 사이를 자기 방식대로 돌아다니며 김찬수라는 사람을 스스로 발견한다. 디지털 매체 위에서도 종이와 크레파스가 가진 물성, 따뜻함, 불완전함과 진정성을 느낄 수 있어야 한다.

