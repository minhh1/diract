// public/outlook-addin/runtime/commands.js
// Event-based runtime for the Diract Signature Outlook add-in. Fires
// automatically every time a user starts composing a new message (see
// manifest.json's autoRunEvents -> newMessageComposeCreated), no ribbon
// click needed -- same "just appears" behaviour as Gmail's native
// signature.
//
// Identity is resolved from Office.context.mailbox.userProfile.emailAddress
// (the signed-in Outlook mailbox's own address, available synchronously,
// no OAuth/SSO exchange needed) rather than full Office SSO -- deliberate
// simplification: signature content isn't sensitive (it's designed to go
// out in every email anyway), so trusting the mailbox's own reported
// identity is an acceptable trade against the real complexity of Azure AD
// app registration + on-behalf-of token exchange. See
// app/api/outlook/signature-for-user/route.ts, the only consumer of this
// email address.
//
// Adapted from Microsoft's own reference implementation
// (OfficeDev/Office-Add-in-samples/Samples/outlook-set-signature) --
// Office.actions.associate is how the manifest's "executeFunction" action
// wires up to this function, and calling eventObj.completed() is required
// or the compose window hangs waiting for this handler to finish.
Office.onReady();

const SIGNATURE_API_BASE = "https://diract.io";

function insertSignature(eventObj) {
  const email = Office.context.mailbox?.userProfile?.emailAddress;
  if (!email) {
    eventObj.completed();
    return;
  }

  fetch(`${SIGNATURE_API_BASE}/api/outlook/signature-for-user?email=${encodeURIComponent(email)}`)
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      if (!data || !data.enabled || !data.html) {
        eventObj.completed();
        return;
      }
      Office.context.mailbox.item.body.setSignatureAsync(
        data.html,
        { coercionType: "html", asyncContext: eventObj },
        asyncResult => {
          asyncResult.asyncContext.completed();
        }
      );
    })
    .catch(() => {
      // Never leave the compose window hanging just because the signature
      // fetch failed (offline, transient error, etc.) -- the user just gets
      // no signature this time rather than a stuck compose window.
      eventObj.completed();
    });
}

Office.actions.associate("insertSignature", insertSignature);
