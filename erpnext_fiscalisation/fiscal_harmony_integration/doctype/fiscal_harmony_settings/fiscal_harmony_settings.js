// Copyright (c) 2024, Eskill Trading (Pvt) Ltd

frappe.ui.form.on("Fiscal Harmony Settings", {
  refresh(frm) {
    // Add Custom Buttons
    frm.add_custom_button(__("Check User Profile"), () => checkUserProfile(frm));
    frm.add_custom_button(__("Get Device Info"), () => getDeviceInfo(frm));
    frm.add_custom_button(__("Update API Token"), () => updateApiToken(frm));
    frm.add_custom_button(__("Get Webhook URL"), () => {
      const webhook = `https://${window.location.hostname}/api/method/capture_signatures`;
      frappe.msgprint(
        `<p>To use the webhook, your ERPNext site must use HTTPS.</p>
         <p>The webhook url to enter in the portal is <strong>${webhook}</strong></p>`,
        "Fiscal Harmony Webhook URL"
      );
    });

    // Branch management buttons
    frm.add_custom_button(__("Add Branch"), () => addBranch(frm));
    frm.add_custom_button(__("Switch Active Branch"), () => switchActiveBranch(frm));
    frm.add_custom_button(__("Remove Branch"), () => removeBranch(frm));
  },

  check_supported_currencies(frm) {
    frappe.call({
      method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.check_supported_currencies",
      args: {
        name: frm.doc.name
      },
      callback: () => frm.reload_doc()
    });
  },

  validate_currency_mappings(frm) {
    if (!(frm.doc.api_key && frm.doc.api_secret) || frm.is_dirty()) return;

    frappe.call({
      method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.validate_currency_mappings",
      args: {
        name: frm.doc.name
      },
      callback: () => frm.reload_doc()
    });
  },

  validate_tax_mappings(frm) {
    if (!(frm.doc.api_key && frm.doc.api_secret) || frm.is_dirty()) return;

    frappe.call({
      method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.validate_tax_mappings",
      args: {
        name: frm.doc.name
      },
      callback: () => frm.reload_doc()
    });
  }
});

/**
 * Add a new branch configuration
 */
const addBranch = (frm) => {
  frappe.prompt([
    {
      label: "Branch Name",
      fieldname: "branch_name",
      fieldtype: "Data",
      reqd: true
    },
    {
      label: "Warehouse",
      fieldname: "warehouse",
      fieldtype: "Link",
      options: "Warehouse",
      reqd: true,
      description: "The ERPNext Warehouse linked to this branch"
    },
    {
      label: "API Key",
      fieldname: "api_key",
      fieldtype: "Data",
      reqd: true
    },
    {
      label: "API Secret",
      fieldname: "api_secret",
      fieldtype: "Password",
      reqd: true
    }
  ], (values) => {
    if (!validateApiCredentials(values.api_key, values.api_secret)) return;

    frappe.call({
      method: "add_branch",
      doc: frm.doc,
      args: {
        branch_name: values.branch_name,
        warehouse: values.warehouse,
        api_key: values.api_key,
        api_secret: values.api_secret
      },
      callback: () => frm.reload_doc()
    });
  }, "Add Branch Configuration", "Submit");
};

/**
 * Switch the active branch
 */
const switchActiveBranch = (frm) => {
  const branches = frm.doc.branch_configurations || [];

  if (branches.length === 0) {
    frappe.msgprint("No branches configured. Please add a branch first.");
    return;
  }

  const branchNames = branches.map(r => r.branch_name);

  frappe.prompt({
    label: "Select Branch",
    fieldname: "target_branch",
    fieldtype: "Select",
    options: branchNames.join("\n"),
    reqd: true
  }, (values) => {
    const currentBranch = frm.doc.active_branch || "None";
    frappe.confirm(
      `Switch active branch from <strong>${currentBranch}</strong> to <strong>${values.target_branch}</strong>?<br><br>This will change the API credentials used for fiscalisation.`,
      () => {
        frappe.call({
          method: "switch_active_branch",
          doc: frm.doc,
          args: {
            branch_name: values.target_branch
          },
          callback: () => {
            frappe.show_alert({
              message: `Switched to branch: ${values.target_branch}`,
              indicator: "green"
            });
            frm.reload_doc();
          }
        });
      }
    );
  }, "Switch Active Branch");
};

/**
 * Remove a branch configuration
 */
const removeBranch = (frm) => {
  const branches = frm.doc.branch_configurations || [];

  if (branches.length === 0) {
    frappe.msgprint("No branches configured.");
    return;
  }

  const branchNames = branches.map(r => r.branch_name);

  frappe.prompt({
    label: "Branch to Remove",
    fieldname: "target_branch",
    fieldtype: "Select",
    options: branchNames.join("\n"),
    reqd: true
  }, (values) => {
    if (values.target_branch === frm.doc.active_branch) {
      frappe.throw("Cannot remove the active branch. Switch to another branch first.");
      return;
    }

    frappe.confirm(
      `Remove branch <strong>${values.target_branch}</strong>?`,
      () => {
        frappe.call({
          method: "remove_branch",
          doc: frm.doc,
          args: {
            branch_name: values.target_branch
          },
          callback: () => frm.reload_doc()
        });
      }
    );
  }, "Remove Branch");
};

/**
 * Update the active branch's API token
 */
const updateApiToken = (frm) => {
  frappe.prompt([
    {
      label: "API Key",
      fieldname: "api_key",
      fieldtype: "Data",
      reqd: true,
      default: frm.doc.api_key
    },
    {
      label: "API Secret",
      fieldname: "api_secret",
      fieldtype: "Password",
      reqd: true
    }
  ], (values) => {
    if (!validateApiCredentials(values.api_key, values.api_secret)) return;

    frappe.call({
      method: "update_active_branch_credentials",
      doc: frm.doc,
      args: {
        api_key: values.api_key,
        api_secret: values.api_secret
      },
      callback: () => frm.reload_doc()
    });
  }, "Update Active Branch API Token", "Submit");
};

/**
 * Validate API credential format
 */
const validateApiCredentials = (key, secret) => {
  const keyRegex = /^[A-Z\d]{32}$/;
  const secretRegex = /^[a-zA-Z\d\/\+]{86}==$/;

  if (!keyRegex.test(key)) {
    frappe.throw("Please provide a valid API key.");
    return false;
  }

  if (!secretRegex.test(secret)) {
    frappe.throw("Please provide a valid API secret.");
    return false;
  }

  return true;
};

/**
 * Check user profile
 */
const checkUserProfile = (frm) => {
  if (!(frm.doc.api_key && frm.doc.api_secret) || frm.is_dirty()) return;

  frappe.call({
    method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.check_user_profile",
    args: {
      name: frm.doc.name
    },
    callback: function (r) {
      if (!r.exc) {
        frappe.msgprint(__('User profile check successful.'));
        frm.reload_doc();
      }
    }
  });
};

/**
 * Get device info
 */
const getDeviceInfo = (frm) => {
  if (!(frm.doc.api_key && frm.doc.api_secret) || frm.is_dirty()) return;

  frappe.call({
    method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.get_device_info",
    args: {
      name: frm.doc.name
    },
    callback: () => frm.reload_doc()
  });
};
