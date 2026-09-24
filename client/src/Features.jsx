import ImportHistoryPage from "./pages/ImportHistoryPage";
import ReceiptsPage from "./pages/ReceiptsPage";
import PlanningPage from "./pages/PlanningPage";

export default function Features({page, ...props}) {
if(page === "Import & history") return <ImportHistoryPage {...props} />;
if(page === "Receipts") return <ReceiptsPage {...props} />;
return <PlanningPage {...props} />;
}
