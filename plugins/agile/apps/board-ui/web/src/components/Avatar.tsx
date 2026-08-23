import { t } from "../i18n";
/** GitHub serves an avatar for any login at github.com/<login>.png with no
 * auth — which is what lets the board show Jira-style avatars instead of
 * `@login` text without adding an API call. `size*2` requests the 2x asset
 * so it stays sharp on retina displays.
 *
 * A null login renders the empty seat rather than nothing at all: Jira always
 * draws an unassigned avatar, and drawing nothing made rows silently change
 * height depending on whether anyone had picked the work up. */
export function Avatar({ login, size = 20 }: { login: string | null; size?: number }) {
  if (!login) {
    return (
      <span
        className="avatar avatar--unassigned"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
        title={`${t("Assignee")}: ${t("None")}`}
        aria-label={`${t("Assignee")}: ${t("None")}`}
      >
        {/* Jira's unassigned silhouette, as a glyph — no icon asset to ship */}
        👤
      </span>
    );
  }
  return (
    <img
      className="avatar"
      src={`https://github.com/${login}.png?size=${size * 2}`}
      width={size}
      height={size}
      alt={`@${login}`}
      title={`@${login}`}
      loading="lazy"
    />
  );
}
