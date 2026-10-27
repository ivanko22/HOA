import { signOut } from "@/lib/auth/config";

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
      className="border-t border-[var(--border)] p-3"
    >
      <button
        type="submit"
        className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      >
        Sign out
      </button>
    </form>
  );
}
