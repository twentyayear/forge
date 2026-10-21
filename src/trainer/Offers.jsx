import React, { useState } from "react";
import { T } from "../theme.js";
import { Button, Card, Chip, Header, Sheet } from "../ui/index.js";
import { call, post } from "../client/net.js";
import { field, fieldLabel, kicker, muted } from "../client/styles.js";
import { ErrorText, Knob, LoadState, ToggleChip } from "./parts.jsx";
import { pickArray, useGet } from "./useGet.js";
import { ageLabel, dollarsToCents, priceLabel } from "./trainer.js";

const KINDS = [
  { id: "session", label: "Session" },
  { id: "call", label: "Call" },
  { id: "program", label: "Program" },
  { id: "other", label: "Other" },
];

// ONE SHEET FOR BOTH NEW AND EDIT: offer null = NEW. DELETE IS OFFERED ONLY FOR A SAVED OFFER.
function OfferSheet({ offer, onClose, onDone, onSignedOut }) {
  const [title, setTitle] = useState(offer ? offer.title : "");
  const [blurb, setBlurb] = useState(offer ? offer.blurb || "" : "");
  const [price, setPrice] = useState(offer ? String(offer.price_cents / 100) : "");
  const [kind, setKind] = useState(offer ? offer.kind : "session");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!title.trim()) { setErr("Give the offer a title."); return; }
    const cents = dollarsToCents(price);
    setBusy(true); setErr("");
    const body = { title: title.trim(), blurb: blurb.trim(), price_cents: cents, kind };
    const res = offer
      ? await call(`/api/admin/offers/${offer.id}`, { method: "PATCH", body: JSON.stringify(body) }, onSignedOut)
      : await post("/api/admin/offers", body, onSignedOut);
    setBusy(false);
    if (res.ok) onDone(offer ? "Offer updated" : "Offer created");
    else if (res.status === 400) setErr("The server couldn't accept that offer. Check the title and the price.");
    else setErr("Couldn't save the offer. Try again.");
  };

  const remove = async () => {
    setBusy(true); setErr("");
    const res = await call(`/api/admin/offers/${offer.id}`, { method: "DELETE" }, onSignedOut);
    setBusy(false);
    if (res.ok) onDone("Offer deleted");
    else if (res.status === 409) setErr("This offer has requests, so it can't be deleted. Turn it off instead.");
    else setErr("Couldn't delete the offer. Try again.");
  };

  return (
    <Sheet title={offer ? "Edit offer" : "New offer"} onClose={onClose}>
      <div style={{ display: "grid", gap: T.space[3], marginTop: T.space[4] }}>
        <div>
          <label htmlFor="of-title" style={fieldLabel}>Title</label>
          <input id="of-title" className="wh-field" type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={field} />
        </div>
        <div>
          <label htmlFor="of-blurb" style={fieldLabel}>Blurb</label>
          <textarea id="of-blurb" className="wh-field" rows={2} value={blurb} onChange={(e) => setBlurb(e.target.value)} style={{ ...field, padding: T.space[3], resize: "vertical", lineHeight: "22px" }} />
        </div>
        <div>
          <label htmlFor="of-price" style={fieldLabel}>Price (dollars)</label>
          <input id="of-price" className="wh-field" type="text" inputMode="decimal" placeholder="45" value={price} onChange={(e) => setPrice(e.target.value)} style={field} />
        </div>
        <div>
          <span style={fieldLabel}>Kind</span>
          <div role="group" aria-label="Kind" style={{ display: "flex", flexWrap: "wrap", gap: T.space[2] }}>
            {KINDS.map((k) => <ToggleChip key={k.id} on={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</ToggleChip>)}
          </div>
        </div>
        <ErrorText>{err}</ErrorText>
        <Button full busy={busy} onClick={save}>{offer ? "Save changes" : "Create offer"}</Button>
        {offer && <Button variant="ghost" full disabled={busy} onClick={remove}>Delete offer</Button>}
      </div>
    </Sheet>
  );
}

export function Offers({ onSignedOut, notify, onOpenThread }) {
  const offers = useGet("/api/admin/offers", onSignedOut, pickArray);
  const requests = useGet("/api/admin/offer-requests", onSignedOut, pickArray);
  const [sheet, setSheet] = useState(null); // null | { offer } where offer may be null for new
  const [busyId, setBusyId] = useState(null);
  const list = offers.data || [];
  const reqs = requests.data || [];

  const toggleActive = async (o) => {
    setBusyId(o.id);
    const res = await call(`/api/admin/offers/${o.id}`, { method: "PATCH", body: JSON.stringify({ active: !o.active }) }, onSignedOut);
    setBusyId(null);
    if (res.ok) offers.reload(); else notify("Couldn't change that offer. Try again.");
  };

  const close = async (r) => {
    setBusyId(`r${r.id}`);
    const res = await call(`/api/admin/offer-requests/${r.id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) }, onSignedOut);
    setBusyId(null);
    if (res.ok) { notify("Request closed"); requests.reload(); offers.reload(); } else notify("Couldn't close that request. Try again.");
  };

  return (
    <section aria-label="Offers" style={{ display: "grid", gap: T.space[3], alignContent: "start" }}>
      <Header kicker="Console" title="Offers" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: T.space[3] }}>
        <h2 style={kicker}>Your offers · {list.length}</h2>
        <Chip tone="energy" onClick={() => setSheet({ offer: null })}>+ New offer</Chip>
      </div>
      <LoadState res={offers} what="your offers" />
      {offers.data && list.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No offers yet. Clients see active offers as cards in their conversation.</p>}
      <div style={{ display: "grid", gap: T.space[2] }}>
        {list.map((o) => (
          <Card key={o.id} style={{ display: "flex", alignItems: "center", gap: T.space[3], opacity: o.active ? 1 : 0.7 }}>
            <button type="button" className="wh-btn" onClick={() => setSheet({ offer: o })} aria-label={`Edit ${o.title}`}
              style={{ flex: 1, minWidth: 0, minHeight: 56, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
              <span style={{ display: "block", fontWeight: 600, color: T.color.text, overflowWrap: "anywhere" }}>{o.title}</span>
              <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: T.space[2], marginTop: 2 }}>
                <Chip>{o.kind}</Chip>
                <span style={{ ...muted, color: T.color.body }}>{priceLabel(o.price_cents)}</span>
                <span style={muted}>{o.request_count || 0} request{o.request_count === 1 ? "" : "s"}</span>
              </span>
            </button>
            <button type="button" role="switch" aria-checked={!!o.active} aria-label={`${o.title} active`} className="wh-btn" disabled={busyId === o.id} onClick={() => toggleActive(o)}
              style={{ minWidth: 56, minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer" }}>
              <Knob on={!!o.active} />
            </button>
          </Card>
        ))}
      </div>

      <h2 style={{ ...kicker, marginTop: T.space[3] }}>Open requests · {reqs.length}</h2>
      <LoadState res={requests} what="the requests" />
      {requests.data && reqs.length === 0 && <p style={{ ...muted, fontSize: T.type.body }}>No open requests.</p>}
      <div style={{ display: "grid", gap: T.space[2] }}>
        {reqs.map((r) => (
          <Card key={r.id} style={{ display: "grid", gap: T.space[2] }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: T.space[3] }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, color: T.color.text }}>{r.user_name}</span>
                <span style={{ ...muted, display: "block", overflowWrap: "anywhere" }}>{r.offer_title}</span>
              </span>
              <span style={muted}>{ageLabel(r.created_at)}</span>
            </div>
            <div style={{ display: "flex", gap: T.space[2], flexWrap: "wrap" }}>
              <Button variant="quiet" onClick={() => onOpenThread({ id: r.user_id, name: r.user_name })}>Open thread</Button>
              <Button variant="ghost" busy={busyId === `r${r.id}`} onClick={() => close(r)}>Mark closed</Button>
            </div>
          </Card>
        ))}
      </div>

      {sheet && (
        <OfferSheet offer={sheet.offer} onClose={() => setSheet(null)} onSignedOut={onSignedOut}
          onDone={(m) => { setSheet(null); notify(m); offers.reload(); requests.reload(); }} />
      )}
    </section>
  );
}
