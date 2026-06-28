import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export function BrandLockup() {
  return (
    <div className="public-brand auth-brand">
      <span className="public-brand-mark">D</span>
      <span>
        <strong>{APP_NAME}</strong>
        <small>{APP_TAGLINE}</small>
      </span>
    </div>
  );
}
