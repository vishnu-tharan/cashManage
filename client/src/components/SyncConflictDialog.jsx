import { mergeVersions } from "../ledger";
import { download } from "../storage";
export default function SyncConflictDialog({
  act,
  backup,
  setConflict,
  conflict,
  data,
  save,
  setMessage,
  lock
}) {
  return <div className="modal-overlay">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Resolve sync conflict">
            <h2>Review device and cloud versions</h2>
            <p>
              Choose which values to keep. Entries present in only one version
              are kept unless you select Delete. Download a backup before
              resolving deletions or linked transfers.
            </p>
            <button onClick={async () => act(async () => download("conflict-device-backup.json", JSON.stringify(await backup())))}>
              Download device backup
            </button>
            <label className="field">
              Profile
              <select onChange={e => setConflict({
          ...conflict,
          choices: {
            ...conflict.choices,
            profile: e.target.value
          }
        })}>
                <option value="remote">Cloud profile</option>
                <option value="local">Device profile</option>
              </select>
            </label>
            {["books", "transactions", "recurring", "goals", "debts"].flatMap(field => {
        const localMap = new Map((data[field] || []).map(x => [x.id, x]));
        const remoteMap = new Map((conflict.remoteData[field] || []).map(x => [x.id, x]));
        return [...new Set([...localMap.keys(), ...remoteMap.keys()])].filter(id => JSON.stringify(localMap.get(id)) !== JSON.stringify(remoteMap.get(id))).map(id => <div className="field" key={field + id}>
                      <strong>
                        {field}:{" "}
                        {localMap.get(id)?.note || localMap.get(id)?.name || remoteMap.get(id)?.note || id}
                      </strong>
                      <small>
                        Device:{" "}
                        {JSON.stringify(localMap.get(id) || "absent").slice(0, 250)}
                      </small>
                      <small>
                        Cloud:{" "}
                        {JSON.stringify(remoteMap.get(id) || "absent").slice(0, 250)}
                      </small>
                      <select value={conflict.choices[field + ":" + id] || "remote"} onChange={e => setConflict({
            ...conflict,
            choices: {
              ...conflict.choices,
              [field + ":" + id]: e.target.value
            }
          })}>
                        <option value="remote">
                          Cloud value (keep device-only entry)
                        </option>
                        <option value="local">Device value</option>
                        {field === "transactions" && <option value="delete">Delete entry</option>}
                      </select>
                    </div>);
      })}
            <button className="primary" onClick={async () => act(async () => {
        const merged = mergeVersions(data, conflict.remoteData, conflict.choices);
        await save(merged, "Resolved synchronization conflict", conflict.remote.revision);
        setConflict(null);
        setMessage("Merged locally. Automatic sync will upload the result.");
      })}>
              Save resolution
            </button>
            <button onClick={async () => {
        setConflict(null);
        lock();
      }}>
              Lock and resolve later
            </button>
          </section>
        </div>;
}
