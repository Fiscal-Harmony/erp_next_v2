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

    // Tax & Currency mapping buttons
    frm.add_custom_button(__("Fetch & Map Taxes"), () => fetchAndMapTaxes(frm)).addClass("btn-primary-dark");
    frm.add_custom_button(__("Fetch & Map Currencies"), () => fetchAndMapCurrencies(frm)).addClass("btn-primary-dark");
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

/**
 * Fetch applicable taxes from Fiscal Harmony device and show mapping dialog
 */
const fetchAndMapTaxes = (frm) => {
  if (!(frm.doc.api_key && frm.doc.api_secret) || frm.is_dirty()) return;

  frappe.call({
    method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.fetch_applicable_taxes",
    args: {
      name: frm.doc.name
    },
    callback: function (r) {
      if (r.exc || !r.message) {
        frappe.msgprint(__("Failed to fetch applicable taxes from device."));
        return;
      }
      if (r.message.length === 0) {
        frappe.msgprint(__("No applicable taxes found on the device."));
        return;
      }
      showTaxMappingDialog(frm, r.message);
    }
  });
};

/**
 * Show dialog to map ERPNext taxes against ZIMRA taxes
 */
const showTaxMappingDialog = (frm, availableTaxes) => {
  const existingMappings = frm.doc.tax_mappings || [];

  const fields = [
    {
      fieldname: "info_html",
      fieldtype: "HTML",
      options: `<div class="text-muted" style="margin-bottom: 12px;">
        ${__("Map only the taxes you use. Leave the others blank. Existing mappings will be replaced.")}
      </div>`
    }
  ];

  // Build a table-like layout with sections for each tax
  availableTaxes.forEach((tax) => {
    const existing = existingMappings.find(
      (m) => m.destination_tax_id === tax.taxID
    );

    fields.push({
      fieldname: `section_${tax.taxID}`,
      fieldtype: "Section Break",
      label: `${tax.taxName} (${tax.taxPercent || "N/A"}%) — Tax ID: ${tax.taxID}`,
    });

    fields.push({
      fieldname: `tax_field_type_${tax.taxID}`,
      fieldtype: "Link",
      label: "Tax Template Type",
      options: "DocType",
      link_filters: '[["DocType","name","in",["Sales Taxes and Charges Template","Item Tax Template"]]]',
      default: existing ? existing.tax_field_type : "",
      reqd: 0,
    });

    fields.push({
      fieldname: `tax_code_${tax.taxID}`,
      fieldtype: "Dynamic Link",
      label: "ERPNext Tax Template",
      options: `tax_field_type_${tax.taxID}`,
      default: existing ? existing.tax_code : "",
      reqd: 0,
    });

    fields.push({
      fieldname: `is_default_${tax.taxID}`,
      fieldtype: "Check",
      label: "Is Default",
      default: existing ? existing.is_default : 0,
    });
  });

  const dialog = new frappe.ui.Dialog({
    title: __("Map ZIMRA Taxes to ERPNext Templates"),
    fields: fields,
    size: "extra-large",
    primary_action_label: __("Save Mappings"),
    primary_action: function () {
      const values = dialog.get_values();
      const mappings = [];

      availableTaxes.forEach((tax) => {
        const taxCode = values[`tax_code_${tax.taxID}`];
        if (!taxCode) return;

        mappings.push({
          tax_field_type: values[`tax_field_type_${tax.taxID}`],
          tax_code: taxCode,
          destination_tax_id: tax.taxID,
          tax_name: tax.taxName,
          tax_percent: tax.taxPercent,
          is_default: values[`is_default_${tax.taxID}`] || 0,
        });
      });

      if (mappings.length === 0) {
        frappe.msgprint(__("No mappings selected."));
        return;
      }

      // Save mappings via dedicated function
      frappe.call({
        method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.save_tax_mappings",
        args: {
          mappings: mappings,
        },
        callback: function (r) {
          if (!r.exc) {
            frappe.show_alert({
              message: __("Tax mappings saved successfully."),
              indicator: "green",
            });
            frm.reload_doc();
          }
        },
      });

      dialog.hide();
    },
  });

  dialog.show();
};

/**
 * Fetch supported currencies from Fiscal Harmony and show mapping dialog
 */
const fetchAndMapCurrencies = (frm) => {
  if (!(frm.doc.api_key && frm.doc.api_secret) || frm.is_dirty()) return;

  frappe.call({
    method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.fetch_supported_currencies",
    args: {
      name: frm.doc.name
    },
    callback: function (r) {
      if (r.exc || !r.message) {
        frappe.msgprint(__("Failed to fetch supported currencies."));
        return;
      }
      if (r.message.length === 0) {
        frappe.msgprint(__("No supported currencies found."));
        return;
      }
      showCurrencyMappingDialog(frm, r.message);
    }
  });
};

/**
 * Show dialog to map ERPNext currencies against Fiscal Harmony currencies
 */
const showCurrencyMappingDialog = (frm, supportedCurrencies) => {
  const existingMappings = frm.doc.currency_mappings || [];

  const currencyOptions = supportedCurrencies.join("\n");

  const fields = [
    {
      fieldname: "info_html",
      fieldtype: "HTML",
      options: `<div class="text-muted" style="margin-bottom: 12px;">
        ${__("Map your ERPNext currencies to Fiscal Harmony currencies. Only map currencies you use.")}
      </div>`
    }
  ];

  // For each existing mapping, show a pre-filled row
  existingMappings.forEach((m, idx) => {
    fields.push({
      fieldname: `section_${idx}`,
      fieldtype: "Section Break",
      label: `${__("Mapping")} ${idx + 1}`,
    });

    fields.push({
      fieldname: `system_currency_${idx}`,
      fieldtype: "Link",
      label: "ERPNext Currency",
      options: "Currency",
      default: m.system_currency || "",
      reqd: 0,
    });

    fields.push({
      fieldname: `fh_currency_${idx}`,
      fieldtype: "Select",
      label: "Fiscal Harmony Currency",
      options: currencyOptions,
      default: m.fiscal_harmony_currency || "",
      reqd: 0,
    });
  });

  // Add one empty row for new mappings
  const newIdx = existingMappings.length;
  fields.push({
    fieldname: `section_${newIdx}`,
    fieldtype: "Section Break",
    label: __("New Mapping"),
  });

  fields.push({
    fieldname: `system_currency_${newIdx}`,
    fieldtype: "Link",
    label: "ERPNext Currency",
    options: "Currency",
    reqd: 0,
  });

  fields.push({
    fieldname: `fh_currency_${newIdx}`,
    fieldtype: "Select",
    label: "Fiscal Harmony Currency",
    options: currencyOptions,
    reqd: 0,
  });

  const dialog = new frappe.ui.Dialog({
    title: __("Map Currencies to Fiscal Harmony"),
    fields: fields,
    size: "extra-large",
    primary_action_label: __("Save Mappings"),
    primary_action: function () {
      const values = dialog.get_values();
      const mappings = [];

      // Collect all rows (existing + new)
      for (let i = 0; i <= newIdx; i++) {
        const sysCurrency = values[`system_currency_${i}`];
        const fhCurrency = values[`fh_currency_${i}`];
        if (!sysCurrency || !fhCurrency) continue;

        // Find existing ID if updating
        const existing = existingMappings[i];
        mappings.push({
          system_currency: sysCurrency,
          fiscal_harmony_currency: fhCurrency,
          currency_id: existing ? existing.currency_id : "",
        });
      }

      if (mappings.length === 0) {
        frappe.msgprint(__("No mappings selected."));
        return;
      }

      frappe.call({
        method: "erpnext_fiscalisation.fiscal_harmony_integration.doctype.fiscal_harmony_settings.fiscal_harmony_settings.save_currency_mappings",
        args: {
          mappings: mappings,
        },
        callback: function (r) {
          if (!r.exc) {
            frappe.show_alert({
              message: __("Currency mappings saved successfully."),
              indicator: "green",
            });
            frm.reload_doc();
          }
        },
      });

      dialog.hide();
    },
  });

  dialog.show();
};
