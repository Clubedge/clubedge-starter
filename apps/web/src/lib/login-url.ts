type LoginUrlOptions = {
  mode?: "signin" | "signup";
  error?: string;
  next?: string;
  checkEmail?: boolean;
};

export function loginUrl({ mode = "signin", error, next, checkEmail }: LoginUrlOptions = {}) {
  const params = new URLSearchParams();
  if (mode === "signup") params.set("mode", "signup");
  if (error) params.set("error", error);
  if (checkEmail) params.set("check-email", "1");
  if (next && next !== "/dashboard") params.set("next", next);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
