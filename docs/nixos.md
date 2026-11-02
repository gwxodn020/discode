# NixOS에서 Discode 사용

Nix 패키지는 npm에서 내려받은 Electron 실행 파일이나 AppImage를 실행하지 않고, 잠긴 Nixpkgs의 **NixOS용 Electron 44.3.0**을 사용합니다. 앱 소스·아이콘과 고정 해시로 확인한 Codicons만 설치합니다. 별도의 `npm install`이 필요하지 않습니다.

현재 저장소는 비공개이므로 먼저 GitHub 접근 권한으로 clone합니다. 다음 명령은 Nix가 설치된 Linux에서 실행합니다.

```sh
git clone https://github.com/gwxodn020/discode.git
cd discode
nix --extra-experimental-features 'nix-command flakes' run .#discode
```

이미 flakes가 활성화되어 있다면 `nix run .#discode`만으로 실행할 수 있습니다.

사용자 프로필에 설치하려면:

```sh
nix --extra-experimental-features 'nix-command flakes' profile install .#discode
discode
```

앱 메뉴에는 아이콘과 함께 **Discord Code**로 표시됩니다. Nix 패키지에는 `discode.desktop`과 hicolor 아이콘이 포함됩니다. 사용자 프로필 설치 후 데스크톱 메뉴가 아직 갱신되지 않았다면 다음 로그인 때 반영될 수 있습니다.

## X11 / Wayland

Nixpkgs Electron의 디스플레이 선택과 시스템 그래픽 라이브러리를 사용합니다. Wayland 환경에서 문제가 있으면 사용자 세션에서 다음과 같이 XWayland를 선택해 비교할 수 있습니다.

```sh
discode --ozone-platform=x11
```

패키지 런처는 `--no-sandbox`를 추가하지 않습니다. 실제 데스크톱에서 샌드박스 오류가 나면 사용자 네임스페이스와 데스크톱 세션 구성을 확인해야 합니다. 테스트 환경의 샌드박스 우회 옵션을 일상 실행에 사용하지 않습니다.

## NixOS 설정에 포함

시스템 flake의 `inputs`에 로컬 체크아웃을 추가하는 예입니다. 경로는 자신의 체크아웃 위치로 바꿉니다.

```nix
inputs.discode.url = "path:/home/USER/discode";
```

`outputs`에서 해당 input을 모듈에 전달한 뒤 시스템 패키지에 추가합니다.

```nix
# outputs = inputs@{ nixpkgs, ... }: { ... } 의 모듈 내부
{
  environment.systemPackages = [
    inputs.discode.packages.${pkgs.stdenv.hostPlatform.system}.discode
  ];
}
```

이 설정 변경과 `nixos-rebuild`는 사용자의 NixOS 설정에서 수행합니다. 앱 패키지는 시스템 설정을 자동으로 변경하지 않습니다.

## 빌드와 검증

```sh
nix build .#discode
nix build .#checks.x86_64-linux.smoke --out-link smoke-result
cat smoke-result
```

GitHub의 **NixOS package** workflow는 x86_64 Linux에서 패키지 빌드와 X11 가상 화면 실행을 검사합니다. 실제 Discord 요청은 테스트 페이지로 대체하며, 앱 시작·아이콘 폰트·메시지 추출·터미널 전송 확인을 검증합니다. 제한된 CI 빌드 환경에서는 이 테스트 프로세스에만 `--no-sandbox`를 전달합니다. 설치된 런처에는 적용되지 않습니다.

`aarch64-linux` 패키지 정의도 제공하지만 CI는 현재 ARM64의 패키지 평가만 확인합니다. ARM64 빌드·실제 NixOS 데스크톱의 Wayland·한글 입력·로그인은 사용 환경에서 추가 확인이 필요합니다.

로그인 정보는 Nix store에 저장하지 않고 기존 Electron 사용자 데이터 경로에 유지합니다. 임시 테스트 프로필은 테스트가 끝나면 삭제합니다.
