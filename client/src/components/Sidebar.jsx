import { confirmAction } from "../dialogs";
import { Wallet, ShieldCheck, LogOut } from "lucide-react";
import { api } from "../storage";
export default function Sidebar({
  menu,
  data,
  session,
  nav,
  page,
  setPage,
  setMenu,
  lock
}) {
  return <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-icon">
            <Wallet />
          </span>
          cashmanage<span className="brand-dot">.</span>
        </div>
        <div className="workspace">
          <span className="avatar">
            {data.profile.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{data.profile.name}</strong>
            <small>
              {session.guest ? "Guest workspace" : "Personal workspace"}
            </small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([n, Icon]) => <button className={page === n ? "active" : ""} key={n} onClick={async () => {
        setPage(n);
        setMenu(false);
      }}>
              <Icon size={19} />
              {n}
              {n === "Cashbooks" && <span className="nav-count">{data.books.length}</span>}
            </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy">
            <ShieldCheck size={22} />
            <strong>A little peace of mind</strong>
            <p>
              {session.guest ? "Try things out. Back up before you leave." : "Your cashbooks are encrypted on this device."}
            </p>
          </div>
          <button onClick={async () => {
        if (!session.guest || (await confirmAction("Guest data will be cleared. Have you exported a backup?"))) {
          api("/logout", "POST").catch(() => {});
          lock();
        }
      }}>
            <LogOut size={18} />
            Lock / sign out
          </button>
          <small>YOUR MONEY. YOUR PACE.</small>
        </div>
      </aside>;
}
