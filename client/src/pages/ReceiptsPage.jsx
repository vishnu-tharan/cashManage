import { download } from "../storage";
export default function ReceiptsPage({
  data,
  save,
  act
}) {
  return <section className="card">
        <h3>Receipt library</h3>
        <p>
          Attach a JPEG, PNG or PDF to a transaction. Files are included in
          encrypted backups. Limit: 300 KB per receipt, 1 MB total attachments.
        </p>
        {data.transactions.map(t => <div className="history-row" key={t.id}>
            <div>
              <strong>{t.note || t.category}</strong>
              <small>
                {t.date} · {t.receipt?.name || "No attachment"}
              </small>
            </div>
            {t.receipt ? <>
                <button onClick={() => {
          const binary = atob(t.receipt.content.split(",")[1]);
          download(t.receipt.name, Uint8Array.from(binary, c => c.charCodeAt(0)), t.receipt.type);
        }}>
                  Download
                </button>
                <button onClick={() => act(() => save({
          ...data,
          transactions: data.transactions.map(x => x.id === t.id ? {
            ...x,
            receipt: undefined
          } : x)
        }, "Removed receipt"))}>
                  Remove
                </button>
              </> : <input aria-label={`Attach receipt to ${t.note || t.category}`} type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => {
        const file = e.target.files[0];
        if (!file) return;
        act(async () => {
          if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type) || file.size > 300000) throw new Error("Choose a JPEG, PNG or PDF under 300 KB");
          const sum = data.transactions.reduce((s, x) => s + (x.receipt?.size || 0), 0);
          if (sum + file.size > 1000000) throw new Error("Total receipt limit is 1 MB");
          const content = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = () => reject(new Error("Could not read receipt"));
            r.readAsDataURL(file);
          });
          await save({
            ...data,
            transactions: data.transactions.map(x => x.id === t.id ? {
              ...x,
              receipt: {
                name: file.name.slice(0, 100),
                size: file.size,
                type: file.type,
                content
              }
            } : x)
          }, "Attached receipt");
        });
        e.target.value = "";
      }} />}
          </div>)}
        {!data.transactions.length && <p>Add a transaction first.</p>}
      </section>;
}
