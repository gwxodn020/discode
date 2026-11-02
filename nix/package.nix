{ lib, stdenvNoCC, electron, fetchurl, makeWrapper, makeDesktopItem, copyDesktopItems, xdg-utils }:
let
  metadata = builtins.fromJSON (builtins.readFile ../package.json);
  codicons = fetchurl {
    url = "https://registry.npmjs.org/@vscode/codicons/-/codicons-0.0.46-24.tgz";
    hash = "sha256-13vy7RUugsS4EojFJxo0gcYVWdGlQWWTdW47D+igK/E=";
  };
in stdenvNoCC.mkDerivation {
  pname = "discode";
  version = metadata.version;
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../main.js ../preload.js ../adapter.js ../model.js ../package.json ../ui ../assets/icon.png
    ];
  };
  nativeBuildInputs = [ makeWrapper copyDesktopItems ];
  dontConfigure = true;
  dontBuild = true;
  desktopItems = [ (makeDesktopItem {
    name = "discode";
    desktopName = "Discord Code";
    genericName = "Discord messaging client";
    exec = "discode %U";
    icon = "discode";
    categories = [ "Network" "InstantMessaging" ];
    startupWMClass = "discode";
    terminal = false;
  }) ];
  installPhase = ''
    runHook preInstall
    appDir="$out/share/discode"
    mkdir -p "$appDir/node_modules/@vscode/codicons" "$out/bin"
    cp main.js preload.js adapter.js model.js package.json "$appDir/"
    cp -r ui assets "$appDir/"
    tar -xf ${codicons} --strip-components=1 -C "$appDir/node_modules/@vscode/codicons"
    makeWrapper ${lib.getExe electron} "$out/bin/discode" \
      --add-flags "$appDir" \
      --add-flags "--class=discode" \
      --prefix PATH : ${lib.makeBinPath [ xdg-utils ]}
    install -Dm644 assets/icon.png "$out/share/icons/hicolor/1024x1024/apps/discode.png"
    runHook postInstall
  '';
  meta = {
    description = metadata.description;
    homepage = "https://github.com/gwxodn020/discode";
    mainProgram = "discode";
    platforms = [ "x86_64-linux" "aarch64-linux" ];
  };
}
