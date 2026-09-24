import { getReportSummary } from "./domain/reportSummary";
import useWorkspace from "./hooks/useWorkspace";
import TransactionDialog from "./components/TransactionDialog";
import SyncConflictDialog from "./components/SyncConflictDialog";
import SettingsPage from "./pages/SettingsPage";
import CashbooksPage from "./pages/CashbooksPage";
import ReportsPage from "./pages/ReportsPage";
import Sidebar from "./components/Sidebar";
import TransactionTable from "./components/TransactionTable";
import AuthPage from "./pages/AuthPage";
import { Currency } from "./components/forms";
import Features from "./Features";
import SharedBooks from "./SharedBooks";
import { budgetAlerts } from "./ledger";
import { Wallet, LayoutDashboard, ArrowDownLeft, Plus, Sun, Moon, ShieldCheck, BookOpen, ChartNoAxesCombined, Settings, RefreshCw, X, Menu } from "lucide-react";
import { today } from "./storage";
export default function App() {
  const {
    session,
    data,
    authMode,
    authenticate,
    busy,
    act,
    setMessage,
    setAuthMode,
    sessionRef,
    setSession,
    setData,
    setStatus,
    message,
    unit,
    book,
    type,
    from,
    to,
    search,
    setPeriod,
    setFrom,
    setTo,
    setModal,
    save,
    menu,
    page,
    setPage,
    setMenu,
    lock,
    online,
    setTheme,
    theme,
    status,
    setUnit,
    setBook,
    sync,
    setSearch,
    setType,
    period,
    backup,
    restore,
    install,
    setSessions,
    sessions,
    setRates,
    rates,
    conflict,
    setConflict,
    modal
  } = useWorkspace();
  if (!session || !data) return <AuthPage authMode={authMode} authenticate={authenticate} busy={busy} act={act} setMessage={setMessage} setAuthMode={setAuthMode} sessionRef={sessionRef} setSession={setSession} setData={setData} setStatus={setStatus} message={message} />;
  const {
    currencyBooks,
    selected,
    income,
    expense,
    balance,
    categoryTotals,
    months,
    maxChart
  } = getReportSummary({
    data,
    unit,
    book,
    type,
    from,
    to,
    search
  });
  const nav = [["Overview", LayoutDashboard], ["Cashbooks", BookOpen], ["Transactions", ArrowDownLeft], ["Reports", ChartNoAxesCombined], ["Planning", Wallet], ["Import & history", BookOpen], ["Receipts", BookOpen], ["Shared", BookOpen], ["Settings", Settings]];
  function setRange(value) {
    setPeriod(value);
    const d = today();
    if (value === "month") {
      setFrom(d.slice(0, 7) + "-01");
      setTo(d);
    } else if (value === "year") {
      setFrom(d.slice(0, 4) + "-01-01");
      setTo(d);
    } else if (value === "all") {
      setFrom("");
      setTo("");
    }
  }
  const transactionTable = <TransactionTable selected={selected} data={data} unit={unit} setModal={setModal} busy={busy} act={act} save={save} />;
  return <div className="shell">
      <Sidebar menu={menu} data={data} session={session} nav={nav} page={page} setPage={setPage} setMenu={setMenu} lock={lock} />
      <div className="main">
        <header className="topbar no-print">
          <button className="icon mobile-menu" aria-label="Toggle navigation" onClick={async () => setMenu(!menu)}>
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i className={online ? "" : "offline"} />
              {online ? "Online" : "Offline"}
            </span>
            <button className="icon" aria-label="Toggle theme" onClick={async () => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <span className="avatar small">
              {data.profile.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR MONEY, AT A GLANCE</div>
              <h1>
                {page === "Overview" ? "Let’s make sense of your money." : page}
              </h1>
              <p>
                {page === "Overview" ? "A clear view of what comes in, what goes out, and what’s next." : "Small details. A clearer financial picture."}
              </p>
            </div>
            <button className="primary no-print" onClick={async () => setModal({
            kind: "transaction"
          })}>
              <Plus size={18} />
              Add transaction
            </button>
          </div>
          {message && <div role="status" className="notice no-print">
              {message}
              <button aria-label="Dismiss message" className="icon" onClick={async () => setMessage("")}>
                <X size={16} />
              </button>
            </div>}
          <div className="context-bar no-print">
            <span>
              <ShieldCheck size={15} />
              {status}
            </span>
            <div>
              <Currency value={unit} onChange={e => {
              setUnit(e.target.value);
              setBook("all");
            }} />
              <button disabled={busy || !online || session.guest} onClick={async () => act(sync)}>
                <RefreshCw size={15} />
                Sync
              </button>
            </div>
          </div>
          {["Overview", "Transactions", "Reports"].includes(page) && <ReportsPage search={search} setSearch={setSearch} book={book} setBook={setBook} currencyBooks={currencyBooks} type={type} setType={setType} period={period} setRange={setRange} from={from} setPeriod={setPeriod} setFrom={setFrom} to={to} setTo={setTo} data={data} unit={unit} balance={balance} income={income} expense={expense} page={page} months={months} maxChart={maxChart} categoryTotals={categoryTotals} selected={selected} act={act} transactionTable={transactionTable} />}
          {page === "Cashbooks" && <CashbooksPage setModal={setModal} data={data} setUnit={setUnit} setBook={setBook} setPage={setPage} setRange={setRange} />}
          {["Planning", "Import & history", "Receipts"].includes(page) && <Features data={data} save={save} act={act} page={page} />}
          {page === "Shared" && <SharedBooks session={session} act={act} />}
          {page === "Overview" && budgetAlerts(data, today().slice(0, 7)).map(b => <div className="notice" key={b.id}>
                {b.name}: {b.percent}% of monthly budget used
              </div>)}
          {page === "Settings" && <SettingsPage session={session} data={data} act={act} lock={lock} save={save} setUnit={setUnit} setMessage={setMessage} busy={busy} backup={backup} restore={restore} online={online} install={install} setSessions={setSessions} sessions={sessions} unit={unit} setRates={setRates} rates={rates} />}
          <footer>
            <span>Built for a little more financial peace of mind.</span>
            <span>
              <ShieldCheck size={14} />{" "}
              {session.guest ? "Guest mode" : "Encrypted workspace"}
            </span>
          </footer>
        </main>
      </div>
      {conflict && <SyncConflictDialog act={act} backup={backup} setConflict={setConflict} conflict={conflict} data={data} save={save} setMessage={setMessage} lock={lock} />}
      {modal && <TransactionDialog setModal={setModal} modal={modal} act={act} save={save} data={data} unit={unit} book={book} busy={busy} message={message} />}
    </div>;
}
