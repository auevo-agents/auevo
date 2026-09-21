import { redirect } from "next/navigation";

// The homepage is being rebuilt as the Auevo platform landing page.
// Until that's designed, "/" forwards to the fee scanner (moved to
// its own route from here) so the product stays usable in the meantime.
export default function Home() {
  redirect("/fees");
}
