const crypto = require("crypto");

//copy from server/routes/list.js
const typeToGridType = (t, field, header_filters, column, calculators) => {
  const jsgField = { field: field.name, title: field.label, editor: true };
  if (t.name === "String" && field.attributes && field.attributes.options) {
    jsgField.editor = "list";

    const values = field.attributes.options.split(",").map((o) => o.trim());
    if (!field.required) values.unshift("");

    jsgField.editorParams = { values, autocomplete: true, listOnEmpty: true };
    if (header_filters) jsgField.headerFilterParams = { values };
    jsgField.headerFilter = !!header_filters;
  } else if (t.name === "String") {
    jsgField.headerFilter = !!header_filters;
    jsgField.sorter = "string";
    if (column.fieldview === "textarea") {
      jsgField.formatter = "textarea";
      jsgField.editor = false;
      if (jsgField.headerFilter) jsgField.headerFilter = "input";
    }
  } else if (t === "Key" || t === "File") {
    if (field.fieldview === "Thumbnail") {
      jsgField.formatter = "__optionalImageFormatter";
      jsgField.formatterParams = {
        height: field.attributes?.height
          ? `${field.attributes?.height || 50}px`
          : undefined,
        width: `${field.attributes?.width || 50}px`,
        urlPrefix: "/files/resize/",
        urlSuffix:
          `/${field.attributes?.width || 50}` +
          (field.attributes?.height ? `/${field.attributes.height}` : ""),
      };
      jsgField.editor = false;
    } else {
      jsgField.editor = "list";
      const values = {};
      (field.options || []).forEach(
        ({ label, value }) => (values[value] = label)
      );
      calculators.push((row) => {
        if (row[field.name]) row[field.name] = `${row[field.name]}`;
      });
      jsgField.editorParams = { values, autocomplete: true, listOnEmpty: true };
      jsgField.formatterParams = { values };
      if (header_filters) jsgField.headerFilterParams = { values };
      jsgField.formatter = "__lookupIntToString";
      jsgField.headerFilter = !!header_filters;
      jsgField.headerFilterFunc = "=";
    }
  } else if (t.name === "Float" || t.name === "Integer") {
    jsgField.editor = "number";
    jsgField.sorter = "number";
    jsgField.hozAlign = "right";
    jsgField.headerHozAlign = "right";
    jsgField.editorParams = {
      step: t.name === "Integer" ? 1 : undefined,
      min:
        typeof field.attributes.min !== "undefined"
          ? field.attributes.min
          : undefined,
      max:
        typeof field.attributes.max !== "undefined"
          ? field.attributes.max
          : undefined,
    };
    jsgField.headerFilter = !!header_filters && "__minMaxFilterEditor";
    jsgField.headerFilterFunc = "__minMaxFilterFunction";
    jsgField.headerFilterLiveFilter = false;
    if (field.fieldview === "show_star_rating") {
      jsgField.formatter = "star";
      jsgField.formatterParams = {
        stars: (field.attributes?.max || 5) - (field.attributes?.min || 1) + 1,
      };
      jsgField.editor = "star";
    }
  } else if (t.name === "Bool") {
    jsgField.editor = "tickCross";
    jsgField.formatter = "tickCross";
    jsgField.hozAlign = "center";
    jsgField.vertAlign = "center";
    jsgField.editorParams = field.required ? {} : { tristate: true };
    jsgField.formatterParams = field.required ? {} : { allowEmpty: true };
    jsgField.headerFilter = !!header_filters;
  } else if (t.name === "Date") {
    jsgField.sorter = "date";

    jsgField.sorter = "date";
    jsgField.sorterParams = {
      format: "iso",
    };
    jsgField.editor = "__flatpickerEditor";

    if (field.fieldview === "showDay") {
      jsgField.editorParams = { dayOnly: true };
      jsgField.formatter = "__isoDateFormatter";
    } else if (field.fieldview === "format") {
      jsgField.formatter = "__isoDateFormatter";
      jsgField.formatterParams = {
        format: field.attributes.format,
      };
    } else {
      jsgField.formatter = "datetime";
      jsgField.formatterParams = {
        inputFormat: "iso",
      };
    }
    jsgField.headerFilter = !!header_filters && "__dateFilterEditor";
    jsgField.headerFilterFunc = "__dateFilterFunction";
    jsgField.headerFilterLiveFilter = false;
  } else if (t.name === "Color") {
    jsgField.editor = "__colorEditor";
    jsgField.formatter = "__colorFormatter";
    jsgField.hozAlign = "center";
    jsgField.vertAlign = "center";
  } else if (t.name === "JSON") {
    if (field.fieldview === "keys_expand_columns") {
      const fv = t.fieldviews.keys_expand_columns;
      const ex = fv.expandColumns(field, column, column);
      jsgField.subcolumns = ex;
      jsgField.field = field;
    } else {
      jsgField.formatter = "__jsonFormatter";
      jsgField.editor = "__jsonEditor";
    }
  } else if (t.name === "SharedFileLink") {
    //console.log(t, column);
    jsgField.formatter = "html";
    const rndid = "col" + hashCol(column);
    const fv = t.fieldviews[column.fieldview];

    calculators.push((row) => {
      row[rndid] =
        fv && row[column.field_name]
          ? fv.run(row[column.field_name], undefined, field.attributes)
          : "";
    });
    jsgField.field = rndid;
    jsgField.clipboard = false;
    jsgField.headerFilter = !!header_filters && "input";
    jsgField.editor = false;
  }

  if (field.calculated) {
    jsgField.editor = false;
  }
  if (field.primary_key) {
    jsgField.editor = false;
  }
  return jsgField;
};

const hashCol = (col) =>
  crypto
    .createHash("sha1")
    .update(JSON.stringify(col))
    .digest("hex")
    .substring(0, 8);

module.exports = { typeToGridType, hashCol };
