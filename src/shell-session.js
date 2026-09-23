(() => {
  const shared = window.__tssregShared;
  const DIALOG_ID = "SAMLDialog";
  const FRAME_ID = "SAMLDialogFrame";
  const MESSAGE_ID = "tssreg-session-message";
  const RELOAD_ID = "tssreg-session-reload";
  const PADDING_CLASS = "sapUiContentPadding";
  const TITLE = "Session Expired";
  const MESSAGE =
    "Your TSS session has expired and could not be renewed in place. Reload the page to sign in again.";

  let modules = null;

  function framed(dialog) {
    return dialog.getContent().some((control) => control.getId() === FRAME_ID);
  }

  function addReload(dialog) {
    if (sap.ui.getCore().byId(RELOAD_ID)) return;
    dialog.insertButton(
      new modules.Button(RELOAD_ID, {
        text: "Reload",
        type: "Emphasized",
        press: () => location.reload(),
      }),
      0
    );
  }

  function apply() {
    if (!modules) return;
    const dialog = sap.ui.getCore().byId(DIALOG_ID);
    if (!dialog || !framed(dialog)) return;
    dialog.destroyContent();
    dialog.addContent(new modules.Text(MESSAGE_ID, { text: MESSAGE }));
    dialog.setContentWidth(null);
    dialog.setContentHeight(null);
    dialog.setState("Warning");
    dialog.setTitle(TITLE);
    dialog.addStyleClass(PADDING_CLASS);
    addReload(dialog);
  }

  shared.whenSapReady(() => {
    sap.ui.require(["sap/m/Text", "sap/m/Button"], (Text, Button) => {
      modules = { Text, Button };
    });
  });

  shared.onUiUpdated(apply);
})();
