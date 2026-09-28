"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Compass, LockKeyhole, Mail } from "lucide-react";
import { derivePasswordProof, randomPasswordSalt, validPassword } from "@/lib/password";

type Mode = "login" | "register";

export function AuthPage({ mode }: { mode: Mode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const safeNext = () => {
    const requested = new URLSearchParams(window.location.search).get("next") ?? "/";
    const target = new URL(requested, window.location.origin);
    return requested.startsWith("/") && target.origin === window.location.origin ? `${target.pathname}${target.search}${target.hash}` : "/";
  };
  const alternate = mode === "login" ? "/register" : "/login";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (mode === "register" && password !== confirmPassword) { setError("两次输入的密码不一致"); return; }
    if (!validPassword(password)) { setError("密码至少 12 位，最多 256 字节"); return; }
    setBusy(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      let clientSalt = randomPasswordSalt();
      if (mode === "login") {
        const saltResponse = await fetch(`/api/auth/salt?email=${encodeURIComponent(normalizedEmail)}`, { cache: "no-store" });
        const saltResult = await saltResponse.json() as { salt?: string; error?: string };
        if (!saltResponse.ok || !saltResult.salt) throw new Error(saltResult.error ?? "暂时无法登录，请稍后重试");
        clientSalt = saltResult.salt;
      }
      const proof = await derivePasswordProof(password, clientSalt);
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, proof, ...(mode === "register" ? { clientSalt, registrationCode } : {}) }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "暂时无法完成操作，请稍后重试");
      window.location.assign(safeNext());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法完成操作，请稍后重试");
      setBusy(false);
    }
  };

  return <main className="auth-page">
    <div className="auth-page-card">
      <Link className="auth-back" href="/"><ArrowLeft size={16} />返回地图</Link>
      <div className="auth-brand"><span><Compass size={26} /></span><strong>漫游记</strong></div>
      <h1>{mode === "login" ? "欢迎回来" : "创建你的账户"}</h1>
      <p className="auth-page-intro">{mode === "login" ? "登录后，继续查看属于你的行程和地图路线。" : "用邮箱作为账户名，之后可以在不同浏览器查看同一份行程。"}</p>
      <form className="auth-page-form" onSubmit={submit}>
        <label htmlFor="auth-email">邮箱地址</label>
        <div className="auth-input-wrap"><Mail size={17} /><input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></div>
        <label htmlFor="auth-password">密码</label>
        <div className="auth-input-wrap"><LockKeyhole size={17} /><input id="auth-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={12} maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 12 位" /></div>
        {mode === "register" && <><label htmlFor="auth-confirm">确认密码</label><div className="auth-input-wrap"><LockKeyhole size={17} /><input id="auth-confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" /></div></>}
        {mode === "register" && <><label htmlFor="auth-registration-code">邀请注册码</label><div className="auth-input-wrap"><LockKeyhole size={17} /><input id="auth-registration-code" type="password" autoComplete="off" required maxLength={256} value={registrationCode} onChange={(event) => setRegistrationCode(event.target.value)} placeholder="请向邀请你的人索取" /></div></>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? "请稍候…" : mode === "login" ? "登录并查看行程" : "注册并进入漫游记"}</button>
      </form>
      <p className="auth-switch">{mode === "login" ? "还没有账户？" : "已经有账户？"}<Link href={alternate} onClick={(event) => { event.preventDefault(); window.location.assign(`${alternate}?next=${encodeURIComponent(safeNext())}`); }}>{mode === "login" ? "立即注册" : "去登录"}</Link></p>
      {mode === "register" && <p className="auth-caution">受邀用户可以分别注册自己的账户，行程彼此独立。目前不验证邮箱，也不支持密码找回；请使用自己的邮箱并妥善保存密码。</p>}
    </div>
  </main>;
}
