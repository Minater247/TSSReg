(() => {
  const shared = window.__tssregShared;
  const DIALOG_ID = "SAMLDialog";
  const FRAME_ID = "SAMLDialogFrame";
  const MESSAGE_ID = "tssreg-session-message";
  const RELOAD_ID = "tssreg-session-reload";
  const PADDING_CLASS = "sapUiContentPadding";
  const HIDDEN_CLASS = "sapUshellSamlDialogHidden";
  const TITLE = "Session Expired";
  const MESSAGE =
    "Your TSS session has expired and could not be renewed in place. Reload the page to sign in again.";

  function framed(dialog) {
    return dialog.getContent().some((control) => control.getId() === FRAME_ID);
  }

  function addReload(dialog, Button) {
    if (sap.ui.getCore().byId(RELOAD_ID)) return;
    dialog.insertButton(
      new Button(RELOAD_ID, {
        text: "Reload",
        type: "Emphasized",
        press: () => location.reload(),
      }),
      0
    );
  }

  function apply(Text, Button) {
    const dialog = sap.ui.getCore().byId(DIALOG_ID);
    if (!dialog?.isOpen() || dialog.hasStyleClass(HIDDEN_CLASS) || !framed(dialog)) return;
    dialog.destroyContent();
    dialog.addContent(new Text(MESSAGE_ID, { text: MESSAGE }));
    dialog.setContentWidth("28rem");
    dialog.setContentHeight("auto");
    dialog.setHorizontalScrolling(false);
    dialog.setVerticalScrolling(false);
    dialog.setState("Warning");
    dialog.setTitle(TITLE);
    dialog.addStyleClass(PADDING_CLASS);
    addReload(dialog, Button);
  }

  shared.whenSapReady(() => {
    sap.ui.require(["sap/m/Text", "sap/m/Button"], (Text, Button) => {
      const update = () => apply(Text, Button);
      /* SAP opens this popup outside the normal UI render cycle and can
         reveal it later by removing a class from the dialog. */
      const observer = new MutationObserver(update);
      observer.observe(sap.ui.getCore().getStaticAreaRef(), {
        subtree: true, childList: true, attributes: true, attributeFilter: ["class"],
      });
      update();
    });
  });
})();
