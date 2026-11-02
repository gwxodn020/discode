{
  description = "Discode: a NixOS-compatible Discord code-editor client";

  inputs.nixpkgs.url = "https://channels.nixos.org/nixpkgs-unstable/nixexprs.tar.zst";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      eachSystem = nixpkgs.lib.genAttrs systems;
      forSystem = system: import nixpkgs { inherit system; };
    in {
      packages = eachSystem (system:
        let pkgs = forSystem system;
        in rec {
          # The locked nixpkgs provides patched Electron 44.3.0, with NixOS library paths.
          discode = pkgs.callPackage ./nix/package.nix { electron = pkgs.electron_44-bin; };
          default = discode;
        });
      apps = eachSystem (system: rec {
        discode = { type = "app"; program = "${self.packages.${system}.discode}/bin/discode"; };
        default = discode;
      });
      checks = eachSystem (system:
        let pkgs = forSystem system;
        in {
          package = self.packages.${system}.discode;
          smoke = pkgs.runCommand "discode-nix-smoke" {
            nativeBuildInputs = [ pkgs.nodejs_24 pkgs.xvfb-run pkgs.dbus ];
            FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
          } ''
            export HOME="$TMPDIR/home"
            mkdir -p "$HOME"
            # Only the isolated headless test lacks Chromium's namespace sandbox.
            # The installed launcher never adds --no-sandbox.
            export DISCODE_TEST_NO_SANDBOX=1
            if ! ${pkgs.dbus.out}/bin/dbus-run-session \
              --config-file=${pkgs.dbus.out}/share/dbus-1/session.conf -- \
              ${pkgs.xvfb-run}/bin/xvfb-run -a ${pkgs.nodejs_24}/bin/node ${./test/nix-smoke.cjs} \
              ${self.packages.${system}.discode}/bin/discode > "$TMPDIR/smoke.log" 2>&1; then
              cat "$TMPDIR/smoke.log"
              exit 1
            fi
            cp "$TMPDIR/smoke.log" "$out"
          '';
        });
    };
}
