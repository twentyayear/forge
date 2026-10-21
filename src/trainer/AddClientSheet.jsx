import React, { useState } from "react";
import { T } from "../theme.js";
import { Button, Sheet } from "../ui/index.js";
import { call, post } from "../client/net.js";
import { field, fieldLabel } from "../client/styles.js";

const errStyle = { margin: `${T.space[1]}px 0 0`, color: T.color.warn, fontSize: T.type.small };

export function AddClientSheet({ onClose, onAdded, onSignedOut }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanName = name.trim();
    const next = {};
    if (!cleanEmail.includes("@")) next.email = "Enter a valid email address.";
    if (!cleanName) next.name = "Enter the client's name.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    const res = await post("/api/admin/clients", { email: cleanEmail, name: cleanName }, onSignedOut);
    setBusy(false);
    if (res.status === 201) { onAdded(cleanEmail); return; }
    if (res.status === 409) setErrors({ email: "That email already has an account" });
    else if (res.status === 400) setErrors({ email: "Check the email and name and try again." });
    else if (res.status === 429) setErrors({ form: "Too many invites this hour. Try again later." });
    else setErrors({ form: "Couldn't add the client. Try again." });
  };

  return (
    <Sheet title="Add client" onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: "grid", gap: T.space[4], marginTop: T.space[4] }}>
        <div>
          <label htmlFor="ac-email" style={fieldLabel}>Email</label>
          <input id="ac-email" className="wh-field" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={email}
            onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? "ac-email-err" : undefined} style={field} />
          {errors.email && <p id="ac-email-err" role="alert" style={errStyle}>{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="ac-name" style={fieldLabel}>Name</label>
          <input id="ac-name" className="wh-field" type="text" autoComplete="off" value={name}
            onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "ac-name-err" : undefined} style={field} />
          {errors.name && <p id="ac-name-err" role="alert" style={errStyle}>{errors.name}</p>}
        </div>
        {errors.form && <p role="alert" style={errStyle}>{errors.form}</p>}
        <Button type="submit" full busy={busy}>Send sign-in link</Button>
      </form>
    </Sheet>
  );
}
