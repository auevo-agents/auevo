import { redirect } from "next/navigation";

// The homepage is being rebuilt as the Auevo platform landing page.
// Until that's designed, "/" forwards to the fee scanner (moved to
// its own route from here) so the product stays usable in the meantime.
//
// The ?wallet= parameter is carried over: links shared before the move
// (auevo.io/?wallet=<address>, posted to X/Telegram) have to keep
// auto-running the scan, and redirect() does not preserve the query
// string on its own.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { wallet } = await searchParams;
  const address = Array.isArray(wallet) ? wallet[0] : wallet;

  redirect(address ? `/fees?wallet=${encodeURIComponent(address)}` : "/fees");
}
