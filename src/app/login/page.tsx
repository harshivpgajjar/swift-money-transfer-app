import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <LoginForm
      next={sp.next}
      initialError={sp.error === "inactive" ? "login.err.deactivated" : undefined}
    />
  );
}
