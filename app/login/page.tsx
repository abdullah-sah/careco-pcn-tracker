import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f0e6", fontFamily: "'Hanken Grotesk',system-ui,sans-serif" }}>
      <form action={login} style={{ background: "#fffdf8", border: "1px solid #e2dbcd", borderRadius: 12, padding: "28px 26px", width: 320, boxShadow: "0 18px 50px -18px rgba(40,32,20,.45)" }}>
        <div style={{ font: "600 18px 'Spectral',serif", marginBottom: 4 }}>PCN Register</div>
        <div style={{ font: "500 9px 'Spline Sans Mono'", letterSpacing: "1.6px", color: "#9a9081", marginBottom: 18 }}>CARECO · PCN REGISTER</div>
        <input name="password" type="password" placeholder="Shared password" autoFocus
          style={{ width: "100%", boxSizing: "border-box", background: "#faf6ec", border: "1px solid #e2dbcd", borderRadius: 8, padding: "11px 12px", font: "500 13px 'Hanken Grotesk'", outline: "none" }} />
        {error ? <div style={{ color: "#9c3327", font: "500 11px 'Hanken Grotesk'", marginTop: 8 }}>Incorrect password.</div> : null}
        <button type="submit" style={{ width: "100%", marginTop: 16, background: "#9c3327", color: "#fffdf8", border: "none", borderRadius: 8, padding: "12px", font: "700 12px 'Spline Sans Mono'", letterSpacing: ".5px", cursor: "pointer" }}>SIGN IN</button>
      </form>
    </div>
  );
}
