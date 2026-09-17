"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGES = [
  { href: "/", label: "Curriculum" },
  { href: "/ask", label: "Ask" },
  { href: "/changes", label: "Changes" },
];

export default function Nav({ user }) {
  const path = usePathname();
  const on = (href) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="top">
      <div className="top-in">
        <Link className="brand" href="/">
          <span className="spectrum" aria-hidden="true">
            <i style={{ background: "#B03A2E" }} /><i style={{ background: "#C2611C" }} />
            <i style={{ background: "#A57C00" }} /><i style={{ background: "#1B7A45" }} />
          </span>
          <span><b>Coaching Curriculum</b><span>CFS Recovery · internal</span></span>
        </Link>
        <nav className="pages">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className={on(p.href) ? "on" : ""}>{p.label}</Link>
          ))}
        </nav>
        <div className="who">
          {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : null}
          <span>{user?.name || ""}</span>
          <span className="role">{user?.isBoard ? "Review Board" : "Coach"}</span>
          <a className="linkish" href="/api/auth/signout" style={{ marginLeft: 4 }}>Sign out</a>
        </div>
      </div>
    </header>
  );
}
