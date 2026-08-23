// The server binary lives inside the installed plugin directory, but it must
// run `gh` / read `.agile/config.yml` against the *user's project*, not its own
// location. BOARD_UI_PROJECT_ROOT is set by the board-opening procedure
// (plugins/agile/docs/open-board.md) to the
// project's cwd; falling back to process.cwd() only supports ad-hoc local
// runs (e.g. `cd my-project && node .../server/index.js`).
export const PROJECT_ROOT = process.env.BOARD_UI_PROJECT_ROOT || process.cwd();
