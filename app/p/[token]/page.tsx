import type { Metadata } from "next";
import { linkOrder, orderPhotoSet } from "@/lib/photos/order-photos";
import { PhoneUploader } from "./uploader";

// Phone photo page, opened by scanning the QR code on the POS. No sign-in:
// the random link is limited to one order and expires after 2 hours.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Garment photos · The London Wash", robots: { index: false, follow: false } };

export default async function PhonePhotosPage({ params }: { params: { token: string } }) {
  const link = await linkOrder(params.token);
  if (!link) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-xl font-semibold">This photo link has expired</h1>
        <p className="mt-2 text-sm text-black/60">Open the order on the POS and tap “Take photos with phone” to get a new QR code.</p>
      </main>
    );
  }
  return <PhoneUploader token={params.token} orderNumber={link.orderNumber} firstName={link.firstName} initial={await orderPhotoSet(link.orderId)} />;
}
