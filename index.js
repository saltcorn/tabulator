const Field = require("@saltcorn/data/models/field");
const User = require("@saltcorn/data/models/user");
const FieldRepeat = require("@saltcorn/data/models/fieldrepeat");

const Table = require("@saltcorn/data/models/table");
const Library = require("@saltcorn/data/models/library");
const Page = require("@saltcorn/data/models/page");
const PageGroup = require("@saltcorn/data/models/page_group");
const Trigger = require("@saltcorn/data/models/trigger");
const { getState, features } = require("@saltcorn/data/db/state");
const Form = require("@saltcorn/data/models/form");
const File = require("@saltcorn/data/models/file");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const {
  eval_expression,
  jsexprToWhere,
} = require("@saltcorn/data/models/expression");
const { check_view_columns } = require("@saltcorn/data/plugin-testing");
const { mergeIntoWhere } = require("@saltcorn/data/utils");
const {
  field_picker_fields,
  picked_fields_to_query,
  stateFieldsToWhere,
  initial_config_all_fields,
  stateToQueryString,
  stateFieldsToQuery,
  link_view,
  getActionConfigFields,
  readState,
  run_action_column,
  calcfldViewOptions,
  calcrelViewOptions,
} = require("@saltcorn/data/plugin-helper");
const {
  text,
  div,
  h5,
  style,
  a,
  script,
  pre,
  domReady,
  button,
  i,
  form,
  input,
  label,
  text_attr,
  select,
  option,
  code,
  link,
} = require("@saltcorn/markup/tags");
const { post_btn, localeDate, localeDateTime } = require("@saltcorn/markup");

const {
  action_url,
  view_linker,
  parse_view_select,
  action_link,
  make_link,
  splitUniques,
} = require("@saltcorn/data/base-plugin/viewtemplates/viewable_fields");
const { mockReqRes } = require("@saltcorn/data/tests/mocks");
const {
  typeToGridType,
  hashCol,
  nest,
  get_tabulator_columns,
  getDarkStyle,
  set_join_fieldviews,
} = require("./common");
const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          return new Form({
            fields: [
              {
                name: "stylesheet",
                label: "Stylesheet",
                type: "String",
                required: true,
                attributes: {
                  options: [
                    "bootstrap5",
                    "bootstrap4",
                    "midnight",
                    "modern",
                    "simple",
                    "site",
                    "site_dark",
                  ],
                },
              },
            ],
          });
        },
      },
    ],
  });

const public_user_role = features?.public_user_role || 10;

const old_columns_step = (req) => ({
  name: "Columns",
  form: async (context) => {
    const table = await Table.findOne(
      context.table_id
        ? { id: context.table_id }
        : { name: context.exttable_name }
    );
    //console.log(context);
    const field_picker_repeat = await field_picker_fields({
      table,
      viewname: context.viewname,
      req,
      has_align: true,
      has_showif: true,
    });
    field_picker_repeat.push({
      name: "frozen",
      label: "Frozen",
      type: "Bool",
    });
    field_picker_repeat.push({
      name: "cssClass",
      label: "CSS Class",
      type: "String",
    });
    field_picker_repeat.push({
      name: "disable_edit",
      label: "Disable editing",
      type: "Bool",
      showIf: { type: "Field" },
    });
    field_picker_repeat.push({
      name: "column_calculation",
      label: "Column Calculation",
      type: "String",
      attributes: {
        options: [
          "avg",
          "max",
          "min",
          "sum",
          "count",
          { name: "__tabulator_colcalc_unique", label: "count unique" },
          { name: "__tabulator_colcalc_counttrue", label: "count true" },
          {
            name: "__tabulator_colcalc_countfalse",
            label: "count false",
          },
          {
            name: "__tabulator_colcalc_avgnonulls",
            label: "avg no nulls",
          },
          {
            name: "__tabulator_colcalc_sumroundquarter",
            label: "sum round to quarter",
          },
        ],
      },
    });
    field_picker_repeat.push({
      name: "calc_dps",
      label: "Calculation decimal places",
      type: "Integer",
      showIf: {
        column_calculation: [
          "avg",
          "max",
          "min",
          "sum",
          "__tabulator_colcalc_avgnonulls",
        ],
      },
    });
    const use_field_picker_repeat = field_picker_repeat.filter(
      (f) => !["state_field"].includes(f.name)
    );
    const cwunit_fld = field_picker_repeat.find(
      (c) => c.name === "col_width_units"
    );
    if (cwunit_fld) {
      cwunit_fld.attributes.options = ["px", "%"];
      cwunit_fld.default = "px";
    }
    const fvs = field_picker_repeat.filter((c) => c.name === "fieldview");
    fvs.forEach((fv) => {
      if (fv?.attributes?.calcOptions?.[1])
        Object.values(fv.attributes.calcOptions[1]).forEach((fvlst) => {
          if (fvlst[0] === "as_text") fvlst.push("textarea");
        });
    });
    // fix legacy values missing view_name
    (context?.columns || []).forEach((column) => {
      if (column.type === "ViewLink" && column.view && !column.view_name) {
        const view_select = parse_view_select(column.view);
        column.view_name = view_select.viewname;
      }
    });
    return new Form({
      fields: [
        new FieldRepeat({
          name: "columns",
          fancyMenuEditor: true,
          fields: use_field_picker_repeat,
        }),
      ],
    });
  },
});

const new_columns_step = (req) => ({
  name: req.__("Columns"),
  builder: async (context) => {
    const table = Table.findOne(context.table_id || context.exttable_name);
    const fields = table.getFields();

    const boolfields = fields.filter((f) => f.type && f.type.name === "Bool");
    const stateActions = Object.entries(getState().actions).filter(
      ([k, v]) => !v.disableInBuilder
    );
    const builtInActions = [
      "Delete",
      "GoBack",
      ...boolfields.map((f) => `Toggle ${f.name}`),
    ];
    const actions = [...builtInActions, ...stateActions.map(([k, v]) => k)];
    const triggerActions = [];
    (
      await Trigger.find({
        when_trigger: { or: ["API call", "Never"] },
      })
    ).forEach((tr) => {
      actions.push(tr.name);
      triggerActions.push(tr.name);
    });
    (
      await Trigger.find({
        table_id: context.table_id,
      })
    ).forEach((tr) => {
      actions.push(tr.name);
      triggerActions.push(tr.name);
    });
    for (const field of fields) {
      if (field.type === "Key") {
        field.reftable = Table.findOne({
          name: field.reftable_name,
        });
        if (field.reftable) await field.reftable.getFields();
      }
    }
    const actionConfigForms = {};
    for (const [name, action] of stateActions) {
      if (action.configFields) {
        actionConfigForms[name] = await getActionConfigFields(action, table, {
          mode: "list",
        });
      }
    }
    //const fieldViewConfigForms = await calcfldViewConfig(fields, false);
    const { field_view_options, handlesTextStyle } = calcfldViewOptions(
      fields,
      "list"
    );
    if (table.name === "users") {
      fields.push(
        new Field({
          name: "verification_url",
          label: "Verification URL",
          type: "String",
        })
      );
      field_view_options.verification_url = ["as_text", "as_link"];
    }
    for (const field of fields) {
      if (field_view_options[field.name]?.[0] === "as_text")
        field_view_options[field.name].push("textarea");
    }
    const rel_field_view_options = await calcrelViewOptions(table, "list");
    const roles = await User.get_roles();
    const { parent_field_list } = await table.get_parent_relations(true, true);

    const { child_field_list, child_relations } =
      await table.get_child_relations(true);
    var agg_field_opts = {};
    child_relations.forEach(({ table, key_field, through }) => {
      const aggKey =
        (through ? `${through.name}->` : "") +
        `${table.name}.${key_field.name}`;
      agg_field_opts[aggKey] = table.fields
        .filter((f) => !f.calculated || f.stored)
        .map((f) => ({
          name: f.name,
          label: f.label,
          ftype: f.type.name || f.type,
          table_name: table.name,
          table_id: table.id,
        }));
    });
    const agg_fieldview_options = {};

    Object.values(getState().types).forEach((t) => {
      agg_fieldview_options[t.name] = Object.entries(t.fieldviews)
        .filter(([k, v]) => !v.isEdit && !v.isFilter)
        .map(([k, v]) => k);
    });
    const pages = await Page.find();
    const groups = (await PageGroup.find()).map((g) => ({
      name: g.name,
    }));
    const images = await File.find({ mime_super: "image" });
    const library = (await Library.find({})).filter((l) =>
      l.suitableFor("list")
    );
    const myviewrow = View.findOne({ name: context.viewname });
    // generate layout for legacy views
    if (!context.layout?.list_columns) {
      const newCols = [];
      const actionDropdown = [];
      const typeMap = {
        Field: "field",
        JoinField: "join_field",
        ViewLink: "view_link",
        Link: "link",
        Action: "action",
        Text: "blank",
        DropdownMenu: "dropdown_menu",
        Aggregation: "aggregation",
        FormulaValue: "blank",
      };
      (context.columns || []).forEach((col) => {
        const newCol = {
          ...col,
          contents: {
            ...col,
            configuration: { ...col },
            type: typeMap[col.type],
          },
        };
        delete newCol._columndef;
        delete newCol.type;

        delete newCol.contents._columndef;
        delete newCol.contents.configuration._columndef;
        delete newCol.contents.configuration.type;

        switch (col.type) {
          case "FormulaValue":
            newCol.contents.isFormula = {
              text: true,
            };
            newCol.contents.contents = col.formula;
            break;
          case "Action":
            newCol.contents.isFormula = {
              action_label: !!col.action_label_formula,
            };
            break;
          case "ViewLink":
            newCol.contents.isFormula = {
              label: !!col.view_label_formula,
            };
            break;
          case "Link":
            newCol.contents.isFormula = {
              url: !!col.link_url_formula,
              text: !!col.link_text_formula,
            };
            newCol.contents.text = col.link_text;
            newCol.contents.url = col.link_url;
            break;
        }
        if (col.in_dropdown)
          actionDropdown.push({ ...col, type: typeMap[col.type] });
        else newCols.push(newCol);
      });
      if (actionDropdown.length) {
        newCols.push({ type: "dropdown_menu", contents: actionDropdown });
      }
      context.layout = {
        besides: newCols,
        list_columns: true,
      };
    }
    return {
      tableName: table.name,
      fields: fields.map((f) => f.toBuilder),
      images,
      actions,
      triggerActions,
      builtInActions,
      actionConfigForms,
      agg_fieldview_options,
      //fieldViewConfigForms,
      field_view_options: {
        ...field_view_options,
        ...rel_field_view_options,
      },
      parent_field_list,
      child_field_list,
      agg_field_opts,
      min_role: (myviewrow || {}).min_role,
      roles,
      library,
      additionalColumnFields: [
        {
          name: "frozen",
          label: "Frozen",
          type: "Bool",
        },
        {
          name: "in_context_menu",
          label: "In context menu",
          sublabel:
            "The context menu appears when the user right-clicks on a row",
          type: "Bool",
        },
        {
          name: "cssClass",
          label: "CSS Class",
          type: "String",
        },
        {
          name: "disable_edit",
          label: "Disable editing",
          type: "Bool",
        },
        {
          name: "column_calculation",
          label: "Column Calculation",
          type: "String",
          attributes: {
            options: [
              "avg",
              "max",
              "min",
              "sum",
              "count",
              { name: "__tabulator_colcalc_unique", label: "count unique" },
              { name: "__tabulator_colcalc_counttrue", label: "count true" },
              {
                name: "__tabulator_colcalc_countfalse",
                label: "count false",
              },
              {
                name: "__tabulator_colcalc_avgnonulls",
                label: "avg no nulls",
              },
              {
                name: "__tabulator_colcalc_sumroundquarter",
                label: "sum round to quarter",
              },
            ],
          },
        },
        {
          name: "calc_dps",
          label: "Calculation decimal places",
          type: "Integer",
          showIf: {
            column_calculation: [
              "avg",
              "max",
              "min",
              "sum",
              "__tabulator_colcalc_avgnonulls",
            ],
          },
        },
      ],
      pages,
      page_groups: groups,
      allowMultiStepAction: true,
      handlesTextStyle,
      mode: "list",
      ownership:
        !!table.ownership_field_id ||
        !!table.ownership_formula ||
        table.name === "users",
    };
  },
});

const view_configuration_workflow = (req) =>
  new Workflow({
    steps: [
      features?.list_builder ? new_columns_step(req) : old_columns_step(req),
      {
        name: "Options",
        form: async (context) => {
          const table = await Table.findOne(
            context.table_id
              ? { id: context.table_id }
              : { name: context.exttable_name }
          );
          const fields = await table.getFields();
          for (const field of fields) {
            await field.fill_fkey_options();
          }
          const { tabcolumns } = await get_tabulator_columns(
            context.viewname,
            table,
            fields,
            context.columns,
            false,
            undefined,
            false
          );
          const colFields = tabcolumns
            .filter((c) =>
              ["Field", "JoinField", "Aggregation", "FormulaValue"].includes(
                c.type
              )
            )
            .map((c) => c.field)
            .filter((s) => s);
          const groupByOptions = new Set([
            ...colFields,
            ...fields.map((f) => f.name),
            "Selected by user",
          ]);
          const boolGroupOptions = new Set([
            ...fields
              .filter((f) => f?.type?.name === "Bool")
              .map((f) => f.name),
            ...colFields
              .filter((f) => f.formatter === "tickCross")
              .map((f) => f.field),
          ]);
          const roles = await User.get_roles();
          let tree_field_options = [];
          //self join
          for (const field of fields) {
            if (field.is_fkey && field.reftable_name == table.name)
              tree_field_options.push(field.name);
          }

          const action_options = (
            await Trigger.find({
              when_trigger: { or: ["API call", "Never"] },
            })
          ).map((tr) => tr.name);
          const editViewOnTable = await View.find({
            table_id: table.id,
            viewtemplate: "Edit",
          });
          action_options.push(
            ...editViewOnTable.map((v) => ({
              label: `${v.name} [Edit]`,
              name: `Edit:` + v.name,
            }))
          );

          return new Form({
            fields: [
              {
                name: "fit",
                label: "Layout Fit",
                type: "String",
                required: true,
                tab: "Layout",
                attributes: {
                  options: [
                    "Columns",
                    "Data",
                    "DataFill",
                    "DataStretch",
                    "DataTable",
                  ],
                },
              },
              {
                name: "responsiveLayout",
                label: "Responsive Layout",
                type: "String",
                required: false,
                tab: "Layout",
                attributes: {
                  options: ["hide", "collapse"],
                },
              },
              {
                name: "groupBy",
                label: "Group by",
                type: "String",
                tab: "Content",
                attributes: {
                  options: [...groupByOptions],
                },
              },
              {
                name: "default_group_by",
                label: "Default group by",
                type: "String",
                tab: "Content",
                attributes: {
                  options: [...groupByOptions].filter(
                    (f) => f !== "Selected by user"
                  ),
                },
                showIf: { groupBy: "Selected by user" },
              },
              {
                name: "group_true_label",
                label: "Group True label",
                type: "String",
                tab: "Content",
                showIf: { groupBy: [...boolGroupOptions] },
              },
              {
                name: "group_false_label",
                label: "Group False label",
                type: "String",
                tab: "Content",
                showIf: { groupBy: [...boolGroupOptions] },
              },
              {
                name: "group_null_label",
                label: "Group null label",
                type: "String",
                tab: "Content",
                showIf: { groupBy: [...boolGroupOptions] },
              },
              {
                name: "group_order_desc",
                label: "Group order descending",
                type: "Bool",
                tab: "Content",
                showIf: { groupBy: [...groupByOptions] },
              },
              {
                name: "tree_field",
                label: "Tree field",
                type: "String",
                tab: "Content",
                attributes: {
                  options: tree_field_options,
                },
              },
              {
                name: "def_order_field",
                label: req.__("Default order by"),
                type: "String",
                tab: "Content",
                attributes: {
                  options: fields.map((f) => f.name),
                },
              },
              {
                name: "include_fml",
                label: req.__("Row inclusion formula"),
                class: "validate-expression",
                tab: "Content",
                sublabel:
                  req.__("Only include rows where this formula is true. ") +
                  req.__("In scope:") +
                  " " +
                  [
                    ...fields.map((f) => f.name),
                    "user",
                    "year",
                    "month",
                    "day",
                    "today()",
                  ]
                    .map((s) => code(s))
                    .join(", "),
                type: "String",
              },
              {
                name: "def_order_descending",
                label: req.__("Default order descending?"),
                type: "Bool",
                tab: "Content",
              },
              {
                name: "hideColsBtn",
                label: "Show/hide columns",
                type: "Bool",
                tab: "Functionality",
                sublabel: "Display drop-down menu to select shown columns",
              },
              {
                name: "column_visibility_presets",
                label: "Column visibility presets",
                type: "Bool",
                tab: "Functionality",
                showIf: { hideColsBtn: true },
              },
              {
                name: "min_role_preset_edit",
                label: "Role to edit",
                sublabel: "Role required to edit presets",
                input_type: "select",
                tab: "Functionality",
                showIf: { hideColsBtn: true, column_visibility_presets: true },
                options: roles.map((r) => ({ value: r.id, label: r.role })),
              },
              {
                name: "hide_null_columns",
                label: "Hide null columns",
                sublabel:
                  "Do not display a column if it contains entirely missing values",
                type: "Bool",
                tab: "Content",
              },
              {
                name: "addRowBtn",
                label: "Add row button",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "header_wrap",
                label: "Wrap column headers",
                type: "Bool",
                tab: "Layout",
              },
              {
                name: "selectable",
                label: "Selectable",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "remove_unselected_btn",
                label: "Show selection button",
                type: "Bool",
                tab: "Functionality",
                showIf: { selectable: true },
              },
              {
                name: "download_csv",
                label: "Download CSV",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "header_filters",
                label: "Header filters",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "movable_cols",
                label: "Movable columns",
                type: "Bool",
                tab: "Layout",
              },
              {
                name: "vert_col_headers",
                label: "Vertical column headers",
                type: "Bool",
                tab: "Layout",
              },
              {
                name: "history",
                label: "History (undo/redo)",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "persistent",
                label: "Persistent configuration",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "reset_persistent_btn",
                label: "Reset persistent button",
                sublabel:
                  "Show button to reset persistent configuration and filters",
                type: "Bool",
                showIf: { persistent: true },
                tab: "Functionality",
              },
              {
                name: "select_range",
                label: "Select range",
                sublabel: "Select range for copy/paste",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "confirm_edits",
                label: "Confirm all edits",
                sublabel:
                  "Every time the user edits a cell, confirm with popup",
                type: "Bool",
                tab: "Functionality",
              },
              {
                name: "dropdown_frozen",
                label: "Action dropdown column frozen",
                type: "Bool",
                tab: "Content",
              },
              {
                name: "ajax_load",
                label: "Progressive loading",
                type: "Bool",
                tab: "Content",
              },
              {
                name: "pagination_enabled",
                label: "Pagination",
                type: "Bool",
                tab: "Layout",
              },
              {
                name: "pagination_size",
                label: "Pagination size",
                type: "Integer",
                default: 20,
                tab: "Layout",
                showIf: { pagination_enabled: true },
              },
              {
                name: "selected_rows_action",
                label: "Selected rows action",
                type: "String",
                tab: "Functionality",
                attributes: {
                  options: [...action_options],
                },
              },
              {
                name: "disable_edit_if",
                label: "Disable edit if",
                sublabel: "Formula",
                type: "String",
                tab: "Functionality",
                class: "validate-expression",
              },
              {
                name: "row_color_formula",
                label: "Row color formula",
                sublabel:
                  "Formula for row background color. Ex.: <code>age>65 ?'#aaffaa': null</code>",
                type: "String",
                tab: "Functionality",
                class: "validate-expression",
              },
              {
                name: "selected_rows_action_once",
                label: "Run action once for all rows",
                type: "Bool",
                tab: "Functionality",
                sublabel:
                  "Tick to run action once with all rows (<code>rows</code> variable). Untick to run multiple times, once for each row (<code>row</code> variable).",
                showIf: { selected_rows_action: [...action_options] },
              },
              {
                name: "override_stylesheet",
                label: "Override stylesheet",
                type: "String",
                attributes: {
                  options: [
                    "bootstrap5",
                    "bootstrap4",
                    "midnight",
                    "modern",
                    "simple",
                    "site",
                    "site_dark",
                  ],
                },
                tab: "Layout",
              },
              {
                name: "height",
                label: "Height",
                type: "String",
                sublabel: "Example: 500px or 50vh. Default is 100%",
                tab: "Layout",
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = async (table_id, viewname, { show_view }) => {
  const table = Table.findOne(table_id);
  const table_fields = table.fields;
  return table_fields
    .filter((f) => !f.primary_key)
    .map((f) => {
      const sf = new Field(f);
      sf.required = false;
      return sf;
    });
};

const initial_config = async ({ table_id, exttable_name }) => {
  const table = Table.findOne(
    table_id ? { id: table_id } : { name: exttable_name }
  );

  const fields = table.getFields().filter((f) => !f.primary_key);
  const columns = [];
  const layoutCols = [];
  fields.forEach((f) => {
    if (!f.type) return;
    if (f.type === "File") {
      const col = {
        type: "field",
        fieldview: "Link",
        field_name: f.name,
      };
      columns.push({ ...col, type: "Field" });
      layoutCols.push({ contents: col, header_label: f.label });
    } else if (f.is_fkey) {
      const col = {
        type: "join_field",
        fieldview: "as_text",
        join_field: `${f.name}.${f.attributes?.summary_field || "id"}`,
      };
      columns.push({ ...col, type: "JoinField" });
      layoutCols.push({ contents: col, header_label: f.label });
    } else {
      const fieldview = f.type?.fieldviews?.show
        ? "show"
        : f.type?.fieldviews?.as_text
        ? "as_text"
        : undefined;
      const col = {
        type: "field",
        fieldview,
        field_name: f.name,
      };
      columns.push({ ...col, type: "Field" });
      layoutCols.push({ contents: col, header_label: f.label });
    }
  });

  return { columns, layout: { list_columns: true, besides: layoutCols } };
};

const addRowButton = (rndid) =>
  button(
    {
      class: "btn btn-sm btn-primary mx-1",
      onClick: `add_tabview_row('${rndid}')`,
    },
    i({ class: "fas fa-plus me-1" }),
    "Add row"
  );

const selectGroupBy = (
  fields,
  columns,
  rndid,
  orderFld,
  orderDesc,
  default_group_by
) => {
  const groupByOptions = {};
  columns.forEach((c) => {
    if (["Field", "JoinField", "Aggregation"].includes(c.type) && c.field)
      groupByOptions[c.field] = c.title || c.field;
  });
  fields.forEach((f) => {
    groupByOptions[f.name] = f.label || f.name;
  });

  return select(
    {
      onChange: `tabUserGroupBy(this, '${rndid}'${
        orderFld ? `, '${orderFld}', ${!!orderDesc}` : ""
      })`,
      class: "mx-1 form-select d-inline",
      style: "width:unset",
    },
    option(
      { value: "", disabled: true, selected: !default_group_by },
      "Group by..."
    ),
    option({ value: "" }, "No grouping"),
    Object.entries(groupByOptions).map(([k, v]) =>
      option({ value: k, selected: k === default_group_by }, v)
    )
  );
};

const hideShowColsBtn = (
  tabcolumns,
  column_visibility_presets,
  presets,
  can_edit,
  viewname,
  rndid
) =>
  div(
    { class: "dropdown d-inline mx-1" },
    button(
      {
        class: "btn btn-sm btn-outline-secondary dropdown-toggle",
        "data-boundary": "viewport",
        type: "button",
        id: "btnHideCols",
        "data-bs-toggle": "dropdown",
        "aria-haspopup": "true",
        "aria-expanded": "false",
      },
      "Show/hide fields"
    ),
    div(
      {
        class: "dropdown-menu",
        "aria-labelledby": "btnHideCols",
      },
      form(
        { class: "px-2 tabShowHideCols" },
        a({ onclick: `allnonecols(true,this)`, href: "javascript:;" }, "All"),
        " | ",
        a({ onclick: `allnonecols(false,this)`, href: "javascript:;" }, "None"),
        !!column_visibility_presets && div("Presets:"),
        column_visibility_presets &&
          Object.entries(presets || {}).map(([k, v]) =>
            div(
              a(
                {
                  href: `javascript:activate_preset('${encodeURIComponent(
                    JSON.stringify(v)
                  )}', '${rndid}');`,
                },
                k
              ),
              can_edit &&
                a(
                  {
                    href: `javascript:delete_preset('${viewname}','${k}');`,
                  },
                  i({ class: "fas fa-trash-alt" })
                )
            )
          ),
        can_edit &&
          !!column_visibility_presets &&
          a(
            {
              class: "d-block",
              href: `javascript:add_preset('${viewname}');`,
            },
            i({ class: "fas fa-plus" }),
            "Add"
          ),

        tabcolumns.map(
          (f) =>
            f.field &&
            !f.frozen &&
            div(
              { class: "form-check" },
              input({
                type: "checkbox",
                onChange: `showHideColView('${f.field}', this, '${rndid}')`,
                class: "form-check-input",
                checked: true,
                "data-fieldname": f.field,
              }),
              label(f.title || f.field)
            )
        )
      )
    )
  );
const run = async (table_id, viewname, cfg, state, extraArgs, queriesObj) => {
  const {
    columns,
    layout,
    fit,
    responsiveLayout,
    hideColsBtn,
    hide_null_columns,
    addRowBtn,
    selectable,
    remove_unselected_btn,
    download_csv,
    header_filters,
    pagination_enabled,
    pagination_size,
    movable_cols,
    history,
    persistent,
    groupBy,
    dropdown_frozen,
    vert_col_headers,
    reset_persistent_btn,
    def_order_field,
    def_order_descending,
    column_visibility_presets,
    presets,
    min_role_preset_edit,
    tree_field,
    selected_rows_action,
    group_true_label,
    group_false_label,
    group_null_label,
    default_group_by,
    group_order_desc,
    header_wrap,
    override_stylesheet,
    ajax_load,
    confirm_edits,
    disable_edit_if,
    row_color_formula,
    select_range,
    height,
  } = cfg;
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  for (const field of fields) {
    await field.fill_fkey_options();
  }
  readState(state, fields);
  let groupBy1 = groupBy;
  if (groupBy1) {
    if (groupBy === "Selected by user" && default_group_by)
      groupBy1 = default_group_by;
    const groupField = fields.find((f) => f.name === groupBy1);
    if (groupField && groupField.is_fkey) {
      let orginalName = groupBy1;
      groupBy1 = `${groupBy1}_${groupField?.attributes?.summary_field || "id"}`;
    }
  }

  let rows = [];
  if (!ajax_load || hide_null_columns)
    rows = (
      await get_db_rows(
        table,
        fields,
        viewname,
        cfg,
        state,
        extraArgs.req,
        extraArgs.isPreview,
        queriesObj
      )
    ).rows;
  else {
    //needed to set agg targetNm
    picked_fields_to_query(columns, fields);
  }

  await set_join_fieldviews({ columns, fields });
  const { tabcolumns, dropdown_id, dropdown_actions, cellStyles } =
    await get_tabulator_columns(
      viewname,
      table,
      fields,
      columns,
      false,
      extraArgs.req,
      header_filters,
      vert_col_headers,
      dropdown_frozen,
      layout
    );

  if (selectable)
    tabcolumns.unshift({
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      headerSort: false,
      width: "20",
      clipboard: false,
      frozen: tabcolumns[0].frozen,
    });
  const use_tabcolumns0 = hide_null_columns
    ? tabcolumns.filter(
        (c) =>
          !c.field ||
          rows.some(
            (row) =>
              row[c.field] !== null && typeof row[c.field] !== "undefined"
          )
      )
    : tabcolumns;
  const use_tabcolumns = use_tabcolumns0.filter((c) => !c.in_context_menu);
  const context_menu_tabcolumns = use_tabcolumns0.filter(
    (c) => c.in_context_menu
  );
  if (ajax_load && hide_null_columns) rows = [];

  const pgSz = pagination_size || 20;
  const paginationSizeChoices = [
    Math.round(pgSz / 2),
    Math.round(pgSz * 0.75),
    pgSz,
    Math.round(pgSz * 1.5),
    pgSz * 2,
    pgSz * 3,
    true,
  ];
  const hasCalculated =
    fields.some((f) => f.calculated) ||
    columns.some((c) => c.type === "FormulaValue") ||
    columns.some((c) => c.type === "JoinField");
  const selected_rows_action_name = selected_rows_action
    ? ((x) => x?.description || x?.name)(
        getState().triggers.find((tr) => tr.name === selected_rows_action)
      ) || selected_rows_action
    : "";

  const rndid = Math.floor(Math.random() * 16777215).toString(16);
  for (const col of use_tabcolumns) {
    if (col.lookupFkeys) {
      const table = Table.findOne(col.lookupFkeys.table);
      const ids = [
        ...new Set(
          rows.map((r) => r[col.field]).filter((x) => x && !isNaN(+x))
        ),
      ];
      const lu_map = {};
      (await table.getRows({ id: { in: ids } })).forEach((r) => {
        lu_map[r.id] = r;
      });
      rows.forEach((r) => {
        if (r[col.field] && lu_map[r[col.field]])
          r[col.field] = lu_map[r[col.field]][col.lookupFkeys.field];
      });
    }
    if (col.showif)
      rows.forEach((r) => {
        if (!eval_expression(col.showif, r, extraArgs.req?.user))
          r[col.field] = null;
      });

    if (header_wrap) col.headerWordWrap = true;
  }
  if (disable_edit_if) {
    use_tabcolumns.forEach((col) => {
      col.editable = "__tabulator_edit_check";
    });
  }
  let rowContextMenu = undefined;
  if (context_menu_tabcolumns.length) {
    const menuCode = context_menu_tabcolumns.map((c) => {
      if (c.formatter === "html" || !c.formatter)
        return `menu.push({
          label: component.getData().${c.field},
          action: function(){}
        });`;
    });
    rowContextMenu = `function(e, component){
        //component - column/cell/row component that triggered the menu
        //e - click event object

        var menu = [];

        ${menuCode.join("\n")}

        return menu;
    }`;
  }

  const darkStyle = await getDarkStyle(extraArgs.req);
  return fragment(
    //script(`var edit_fields=${JSON.stringify(jsfields)};`),
    //script(domReady(versionsField(table.name))),
    style(`.tabulator-popup-container {background: white}`),
    style(
      Object.entries(cellStyles || {})
        .map(
          ([fld, style]) =>
            `.tabulator-cell[tabulator-field="${fld}"] {${Object.entries(
              style || {}
            )
              .map(([k, v]) => `${k}: ${v};`)
              .join("")}}`
        )
        .join("\n")
    ),
    script(
      domReady(`
      ${
        darkStyle
          ? `
      var styleElement = document.createElement('style');
      styleElement.textContent = ${JSON.stringify(darkStyle)};
      document.head.appendChild(styleElement);`
          : ""
      }

      const columns=${JSON.stringify(use_tabcolumns)};   
      const dropdown_actions = ${JSON.stringify(dropdown_actions)};
      window.actionPopup = (e, row) => {
        return row.getRow().getData()._dropdown;
      }
      columns.forEach(col=>{
        Object.entries(col).forEach(([k,v])=>{
          if(typeof v === "string" && v.startsWith("__")) {
            col[k] = window[v.substring(2)];
          }
        })
      })
      ${
        persistent
          ? `let initialHeaderFilter=[];
      try {
        initialHeaderFilter = JSON.parse(localStorage.getItem('tabfiltr_${viewname}'));
      } catch(e) {
      }`
          : ""
      }
    window.tabulator_table_${rndid} = new Tabulator("#tabgrid${viewname.replaceAll(
        " ",
        ""
      )}${rndid}", {
        ${
          ajax_load
            ? `
        ajaxURL: "/view/${viewname}/get_rows",
        ${
          pagination_enabled
            ? 'paginationMode:"remote",'
            : extraArgs.isPreview
            ? ""
            : `progressiveLoad:"scroll",`
        }
        ajaxParams: {state:${JSON.stringify(state)}},
        filterMode:"remote",
        sortMode:"remote",
        ajaxContentType:"json",
        ajaxConfig:{
          method: "POST",
          headers: {
            "CSRF-Token": _sc_globalCsrf,
          },
        },
        `
            : `data: ${JSON.stringify(rows)},`
        }
        ${
          disable_edit_if || row_color_formula
            ? `rowFormatter: function(row) {
          if(row.getData()._disable_edit) {
            row.getElement().style.backgroundColor = "#cccccc";
          } ${
            row_color_formula
              ? `const rowcol = (new Function("{${fields
                  .map((f) => f.name)
                  .join(",")}}", "return "+${JSON.stringify(
                  row_color_formula
                )}))(row.getData());
                if(rowcol) {
                  row.getElement().style.backgroundColor = rowcol;
          }`
              : ""
          }
        },`
            : ``
        }
        layout:"fit${fit || "Columns"}", 
        ${responsiveLayout ? `responsiveLayout: "${responsiveLayout}",` : ""}
        columns,
        pagination:${!!pagination_enabled},
        paginationSize:${
          !pagination_enabled && ajax_load ? 100 : pagination_size || 20
        },
        paginationSizeSelector: ${JSON.stringify(paginationSizeChoices)},
        clipboard:true,
        ${
          select_range
            ? `selectableRange:1,
        selectableRangeColumns:true,
        selectableRangeRows:true,
        selectableRangeClearCells:true,
        editTriggerEvent:"dblclick",
        clipboardCopyStyled:false,
        clipboardCopyConfig:{
            rowHeaders:false,
            columnHeaders:false,
        },
        clipboardCopyRowRange:"range",
        clipboardPasteParser:customPasteParser,
        clipboardPasteAction:"range",`
            : ""
        }
        ${persistent ? `initialHeaderFilter,` : ""}
        persistence:${!!persistent}, 
        persistenceID:"tabview_${viewname}",
        movableColumns: ${!!movable_cols},
        downloadEncoder: sc_tab_downloadEncoder,
        ${rowContextMenu ? `rowContextMenu: ${rowContextMenu},` : ""}
        history: ${!!history},
        ${
          tree_field
            ? "dataTree:true,dataTreeStartExpanded:true,dataTreeSelectPropagate:true,"
            : ""
        }
        ${
          tree_field && selectable
            ? `dataTreeElementColumn:"${
                use_tabcolumns.find((c) => c.field).field
              }",`
            : ""
        }
        ${
          groupBy1
            ? `groupBy: ${
                group_true_label || group_false_label
                  ? `(data)=>
         data.${groupBy1}===true
         ? "${group_true_label || "True"}"
         : data.${groupBy1}===false
         ? "${group_false_label || "False"}"
         : "${group_null_label || "N/A"}"`
                  : groupBy1 === "Selected by user"
                  ? "false"
                  : `"${groupBy1}"`
              },`
            : ""
        }
        ${
          def_order_field && !groupBy1
            ? `initialSort:[
            
          {column:"${def_order_field}", dir:"${
                def_order_descending ? "desc" : "asc"
              }"},
        ],`
            : ""
        }
        ajaxResponse:function(url, params, response){                  
          if(typeof response.success!=="undefined")
          return response.success; //return the tableData property of a response json object
          else return response
        },
    });
    const save_row_from_cell= gen_save_row_from_cell(${JSON.stringify({
      confirm_edits,
      hasCalculated,
      rndid,
      table_name: table.name,
      viewname,
    })});
    if(${!!persistent}) {
      var firstFilter = true;
      window.tabulator_table_${rndid}.on("dataFiltered", function(filters, rows){
        if(firstFilter) {firstFilter= false; return;}
        localStorage.setItem('tabfiltr_${viewname}', JSON.stringify(filters));
      });
      setTimeout(()=>{
        try {
          const filters = JSON.parse(localStorage.getItem('tabfiltr_${viewname}'));
          for(const filter of filters||[])
            window.tabulator_table_${rndid}.setHeaderFilterValue(filter.field, filter.value);
        } catch(e) {
          console.error(e)
        }
      })
    }
    ${
      select_range
        ? `window.tabulator_table_${rndid}.on("clipboardPasted", function(clipboard, rowData, rows){         
          rows.forEach((row, ix)=>{
            const keys = Object.keys(rowData[ix])
            keys.forEach((key)=>{
              save_row_from_cell(row.data, key)
            })
          })

        })`
        : ``
    }
    window.tabulator_table_${rndid}.on("cellEditing", function(cell) {storeRowEditing(cell)})
    window.tabulator_table_${rndid}.on("cellEdited", function(cell){
      const row=cell.getRow().getData();
      if(cell.getField()==="${dropdown_id}"){
        const val = cell.getValue();
        const action= row[val]
        if(typeof action==="string") {
          const form = document.createElement('form');
          form.method = 'POST';
          form.action = action;
          const hiddenField = document.createElement('input');
          hiddenField.type = 'hidden';
          hiddenField.name = '_csrf';
          hiddenField.value = _sc_globalCsrf;
          form.appendChild(hiddenField);
          document.body.appendChild(form);
          form.submit();
        }         
        if(action && action.javascript)
          eval(action.javascript)        
      }
      else save_row_from_cell(row, cell)
    });
    window.tabulator_table_${rndid}.on("historyUndo", function(action, component, data){
      
      switch (action) {
        case "cellEdit": 
          save_row_from_cell(component.getRow().getData(), component)
          break;
        case "rowDelete": 
          const {id, ...delRow} = data.data
          save_row_from_cell( data.data, undefined, true)
          break;
      }
    })
    window.tabulator_table_${rndid}.on("historyRedo", function(action, component, data){
      switch (action) {
        case "cellEdit": 
          save_row_from_cell(component.getRow().getData(), component)
          break;
      }
    })
    window.tabulator_table_name_${rndid}="${table.name}";
    window.tab_remove_unselected = () =>{
      const allRowCount = window.tabulator_table_${rndid}.getDataCount();
      const selRowCount = window.tabulator_table_${rndid}.getDataCount("selected");
      if(selRowCount < allRowCount/2) {
        const rows = window.tabulator_table_${rndid}.getData("selected");
        window.tabulator_table_${rndid}.clearData();
        for(const row of rows) 
          window.tabulator_table_${rndid}.addRow(row);
      } else {
        const selected = new Set(window.tabulator_table_${rndid}.getSelectedRows().map(r=>r.getIndex()));
        const rows = window.tabulator_table_${rndid}.getRows();
        const to_delete=[]
        for(const row of rows) 
          if(!selected.has(row.getIndex())) 
            to_delete.push(row);   
        
        window.tabulator_table_${rndid}.deleteRow(to_delete);
      }
    }
    window.tab_reset_persistcfg = () =>{
      for (const key in localStorage){
        if(key.startsWith('tabulator-tabview_${viewname}-'))
          localStorage.removeItem(key);
      }
      window.tabulator_table_${rndid}.clearFilter(true);
      location.reload();
    }
    window.allnonecols= (do_show, e) =>{
      columns.forEach(col=>{
        if(col.frozen && !do_show) return;
        if (do_show) window.tabulator_table_${rndid}.showColumn(col.field);
        else window.tabulator_table_${rndid}.hideColumn(col.field);
        $(e).closest("form").find("input").prop("checked", do_show)
      })
    }
    ${
      download_csv
        ? `document.getElementById("tabulator-download-csv").addEventListener("click", function(){
            const selectedData = window.tabulator_table_${rndid}.getSelectedData();
            window.tabulator_table_${rndid}.download(tabCustomCsvDownload, "${viewname}.csv",{}, selectedData.length>0 ? "selected" : "all");
          });`
        : ""
    }`)
    ),

    history &&
      button(
        {
          class: "btn btn-sm btn-primary mx-1",
          title: "Undo",
          onClick: `window.tabulator_table_${rndid}.undo()`,
        },
        i({ class: "fas fa-undo" })
      ),
    history &&
      button(
        {
          class: "btn btn-sm btn-primary mx-1",
          title: "Redo",
          onClick: `window.tabulator_table_${rndid}.redo()`,
        },
        i({ class: "fas fa-redo" })
      ),
    groupBy === "Selected by user" &&
      selectGroupBy(
        fields,
        columns,
        rndid,
        def_order_field,
        def_order_descending,
        default_group_by
      ),
    selected_rows_action &&
      button(
        {
          class: "btn btn-sm btn-primary mx-1",
          title: "on selected rows",
          onClick: `run_selected_rows_action('${viewname}', ${selectable}, '${rndid}', ${!!tree_field})`,
        },
        selected_rows_action_name.replaceAll("Edit:", "")
      ),

    remove_unselected_btn &&
      button(
        {
          class: "btn btn-sm btn-primary mx-1",
          title: "Redo",
          onClick: `tab_remove_unselected()`,
        },
        "Show selection"
      ),
    download_csv &&
      button(
        {
          class: "btn btn-sm btn-primary mx-1",
          id: "tabulator-download-csv",
        },
        i({ class: "fas fa-download me-1" }),
        "Download"
      ),
    reset_persistent_btn &&
      button(
        {
          class: "btn btn-sm btn-primary mx-1",
          title: "Reset",
          onClick: `tab_reset_persistcfg()`,
        },
        "Reset"
      ),
    addRowBtn && addRowButton(rndid),
    hideColsBtn &&
      hideShowColsBtn(
        tabcolumns,
        column_visibility_presets,
        presets,
        (extraArgs.req?.user?.role_id || public_user_role) <=
          (min_role_preset_edit || 1),
        viewname,
        rndid
      ),
    override_stylesheet &&
      link({
        rel: "stylesheet",
        href: `/plugins/public/tabulator@${
          require("./package.json").version
        }/tabulator_${override_stylesheet}.min.css`,
      }),

    div({ id: "jsGridNotify", class: "my-1" }),

    div({
      id: `tabgrid${viewname.replaceAll(" ", "")}${rndid}`,
      style: { height: height || "100%" },
    })
  );
};

const add_preset = async (
  table_id,
  viewname,
  { presets, min_role_preset_edit },
  body,
  { req, res }
) => {
  if ((req.user?.role_id || public_user_role) > (min_role_preset_edit || 1)) {
    console.log("not authorized", min_role_preset_edit);
    return;
  }
  const newPresets = presets || {};
  newPresets[body.name] = body.preset;
  const view = await View.findOne({ name: viewname });
  const newConfig = {
    configuration: { ...view.configuration, presets: newPresets },
  };
  await View.update(newConfig, view.id);
};

const delete_preset = async (
  table_id,
  viewname,
  { presets, min_role_preset_edit },
  body,
  { req, res }
) => {
  if ((req.user?.role_id || public_user_role) > +(min_role_preset_edit || 1)) {
    console.log("not authorized");
    return;
  }

  const newPresets = presets || {};
  delete newPresets[body.name];
  const view = await View.findOne({ name: viewname });
  const newConfig = {
    configuration: { ...view.configuration, presets: newPresets },
  };
  await View.update(newConfig, view.id);
};
const get_db_rows = async (
  table,
  fields,
  viewname,
  {
    layout,
    columns,
    groupBy,
    def_order_field,
    def_order_descending,
    tree_field,
    default_group_by,
    group_order_desc,
    header_filters,
    vert_col_headers,
    dropdown_frozen,
    disable_edit_if,
    include_fml,
  },
  state,
  req,
  isPreview,
  queriesObj,
  limit,
  offset,
  alsoCount,
  filter,
  sort
) => {
  const fieldNames = new Set(fields.map((f) => f.name));

  const where = await stateFieldsToWhere({ fields, state, table });
  const q = await stateFieldsToQuery({ state, fields, prefix: "a." });
  let postFetchSort;
  let postFetchFilter;
  if (filter) {
    filter.forEach(({ field, type, value }) => {
      if (fieldNames.has(field))
        where[field] =
          type === "like"
            ? { ilike: value }
            : value.start || value.end
            ? { gt: value.start, lt: value.end }
            : value;
      else {
        if (!postFetchFilter) postFetchFilter = [];
        const valS = `${value}`;
        if (type === "like")
          postFetchFilter.push((r) =>
            `${r[field] || ""}`.toLowerCase().includes(valS.toLocaleLowerCase())
          );
        else if (value.start || value.end)
          postFetchFilter.push((r) => {
            let v = r[field];
            if (isNaN(v)) return false;
            return value.start && value.end
              ? v >= value.start && v <= value.end
              : value.start
              ? v >= value.start
              : v <= value.end;
          });
        else if (value.start === "" && value.end == "") {
          //do nothing
        } else postFetchFilter.push((r) => `${r[field] || ""}` == value);
      }
    });
  }

  if (sort && sort.length === 1) {
    sort.forEach(({ field, dir }) => {
      if (fieldNames.has(field)) {
        q.orderBy = field;
        q.orderDesc = dir === "desc";
      } else postFetchSort = { field, desc: dir === "desc" };
    });
  }
  //const rows_per_page = default_state && default_state._rows_per_page;
  //if (!q.limit && rows_per_page) q.limit = rows_per_page;
  if (!q.orderBy) q.orderBy = table.pk_name;
  if (limit && !postFetchSort && !postFetchFilter) q.limit = limit;
  else if (isPreview) q.limit = 20;
  if (offset && !postFetchSort && !postFetchFilter) q.offset = offset;
  //if (!q.orderDesc) q.orderDesc = default_state && default_state._descending;
  const current_page = parseInt(state._page) || 1;
  const { joinFields, aggregations } = picked_fields_to_query(columns, fields);
  await set_join_fieldviews({ columns, fields });
  let groupBy1 = groupBy;
  if (groupBy1) {
    if (groupBy === "Selected by user" && default_group_by)
      groupBy1 = default_group_by;
    const groupField = fields.find((f) => f.name === groupBy1);
    if (groupField && groupField.is_fkey) {
      let orginalName = groupBy1;
      groupBy1 = `${groupBy1}_${groupField?.attributes?.summary_field || "id"}`;
      if (!joinFields[groupBy1])
        joinFields[groupBy1] = {
          ref: orginalName,
          target: groupField?.attributes?.summary_field || "id",
        };
    }
  }

  // console.log(aggregations);
  if (include_fml) {
    const ctx = { ...state, user_id: req.user?.id || null, user: req.user };
    let where1 = jsexprToWhere(include_fml, ctx, fields);
    mergeIntoWhere(where, where1 || {});
  }
  let rows = queriesObj?.get_rows_query
    ? await queriesObj.get_rows_query(where, joinFields, aggregations, q)
    : await table.getJoinedRows({
        where,
        joinFields,
        aggregations,
        ...q,
        forPublic: !req.user,
        forUser: req.user,
      });
  const { calculators } = await get_tabulator_columns(
    viewname,
    table,
    fields,
    columns,
    false,
    req,
    header_filters,
    vert_col_headers,
    dropdown_frozen,
    layout
  );
  calculators.forEach((f) => {
    rows.forEach(f);
  });

  if (postFetchFilter) {
    let f = (x) => true;
    postFetchFilter.forEach((filter) => {
      const oldf = f;
      const newf = (x) => filter(x) && oldf(x);
      f = newf;
    });
    rows = rows.filter(f);
  }
  if (postFetchSort) {
    const dirDown = postFetchSort.desc ? 1 : -1;
    const dirUp = postFetchSort.desc ? -1 : 1;
    const cmp = (a, b) => {
      const va = a[postFetchSort.field];
      const vb = b[postFetchSort.field];
      if (typeof va === "undefined" && typeof vb !== "undefined")
        return dirDown;
      if (typeof va !== "undefined" && typeof vb === "undefined") return dirUp;
      //console.log({ va, vb, res: va > vb ? dirUp : vb > va ? dirDown : 0 });
      return va > vb ? dirUp : vb > va ? dirDown : 0;
    };
    //console.log("sorting", rows[0]);
    rows.sort(cmp);
  }

  if ((postFetchFilter || postFetchSort) && offset) {
    rows = rows.slice(offset);
  }
  if ((postFetchFilter || postFetchSort) && limit) {
    rows = rows.slice(0, limit);
  }

  if (tree_field) {
    const my_ids = new Set(rows.map((r) => r.id));
    for (const row of rows) {
      if (row[tree_field] && my_ids.has(row[tree_field]))
        row._parent = row[tree_field];
      else row._parent = null;
    }

    rows = nest(rows);
  }
  if (groupBy1 && def_order_field) {
    const dir = def_order_descending ? -1 : 1;
    const dirGroup = group_order_desc ? -1 : 1;

    rows.sort((a, b) =>
      a[groupBy1] > b[groupBy1]
        ? dirGroup
        : b[groupBy1] > a[groupBy1]
        ? -1 * dirGroup
        : a[def_order_field] > b[def_order_field]
        ? dir
        : b[def_order_field] > a[def_order_field]
        ? -1 * dir
        : 0
    );
  } else if (groupBy1) {
    const dir = group_order_desc ? -1 : 1;

    rows.sort((a, b) =>
      a[groupBy1] > b[groupBy1] ? dir : b[groupBy1] > a[groupBy1] ? -1 * dir : 0
    );
  }

  if (disable_edit_if) {
    const set_disable_edit = (row) => {
      if (eval_expression(disable_edit_if, row)) row._disable_edit = true;
      (row._children || []).forEach(set_disable_edit);
    };
    rows.forEach(set_disable_edit);
  }

  if (alsoCount) {
    const count = await table.countRows(where);
    return { rows, count };
  } else return { rows };
};
const get_rows = async (
  table_id,
  viewname,
  cfg,
  { state, page, size, filter, sort },
  { req, res }
) => {
  //console.log({ filter, sort, state, page, size });
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  let limit = size === "true" ? undefined : size || cfg.pagination_size || 50;
  const offset = page && limit ? (+page - 1) * (+limit || 20) : 0;
  const { rows, count } = await get_db_rows(
    table,
    fields,
    viewname,
    cfg,
    state,
    req,
    false,
    undefined,
    limit,
    offset,
    !!page,
    filter,
    sort
  );

  if (page) {
    if (size)
      return { json: { data: rows, last_page: Math.ceil(count / +size) } };
    else return { json: { data: rows } };
  } else return { json: rows };
};

const run_action = async (
  table_id,
  viewname,
  { columns, layout },
  body,
  { req, res }
) => {
  const col = body.rndid
    ? columns.find((c) => c.type === "Action" && c.rndid === body.rndid)
    : columns.find(
        //legacy
        (c) =>
          c.type === "Action" &&
          c.action_name === body.action_name &&
          body.action_name
      );
  //console.log({ col, body });
  const table = await Table.findOne({ id: table_id });
  const row = await table.getRow({ id: body.id });
  const state_action = getState().actions[col.action_name];
  col.configuration = col.configuration || {};
  if (state_action) {
    const cfgFields = await getActionConfigFields(state_action, table);
    cfgFields.forEach(({ name }) => {
      if (typeof col[name] !== "undefined") col.configuration[name] = col[name];
    });
  }
  try {
    const result = await run_action_column({
      col,
      req,
      res,
      table,
      row,
      user: req.user,
      referrer: req.get("Referrer"),
    });
    return { json: { success: "ok", ...(result || {}) } };
  } catch (e) {
    return { json: { error: e.message || e } };
  }
};

const run_selected_rows_action = async (
  table_id,
  viewname,
  { selected_rows_action, selected_rows_action_once },
  { rows, action_edit_row, rndid },
  { req, res }
) => {
  if (selected_rows_action.startsWith("Edit:")) {
    if (action_edit_row) {

      return {}
    } else
      return {
        json: {
          eval_js: `run_action_multi_edit("${selected_rows_action.replaceAll(
            "Edit:",
            ""
          )}", "${rndid}", "${viewname}")`,
        },
      };
  }
  const table = await Table.findOne({ id: table_id });

  const trigger = await Trigger.findOne({ name: selected_rows_action });
  if (!trigger)
    return { json: { error: "Trigger not found: " + selected_rows_action } };
  const action = getState().actions[trigger.action];
  if (!action)
    return { json: { error: "Action not found: " + trigger.action } };

  let result;
  const actionArg = {
    referrer: req.get("Referrer"),
    table,
    req,
    Table,
    user: req.user,
    configuration: trigger.configuration,
  };
  if (selected_rows_action_once)
    result = await action.run({
      rows,
      ...actionArg,
    });
  else
    for (const row of rows)
      result = await action.run({
        row,
        ...actionArg,
      });

  return { json: { success: "ok", ...(result || {}) } };
};
module.exports = {
  headers: ({ stylesheet }) => [
    {
      script: `/plugins/public/tabulator${
        features?.version_plugin_serve_path
          ? "@" + require("./package.json").version
          : ""
      }/tabulator.min.js`,
    },
    {
      script: `/plugins/public/tabulator${
        features?.version_plugin_serve_path
          ? "@" + require("./package.json").version
          : ""
      }/custom.js`,
    },
    {
      script: "/plugins/public/tabulator/luxon.min.js",
    },
    {
      script: "/flatpickr.min.js",
    },
    {
      css: `/flatpickr.min.css`,
    },
    {
      script: "/gridedit.js",
    },
    {
      css: `/plugins/public/tabulator${
        features?.version_plugin_serve_path
          ? "@" + require("./package.json").version
          : ""
      }/tabulator_${stylesheet || "bootstrap5"}.min.css`,
    },
  ],
  sc_plugin_api_version: 1,
  plugin_name: "tabulator",
  configuration_workflow,
  fieldviews: features.ellipsize
    ? undefined
    : () => ({
        ellipsize: {
          type: "String",
          isEdit: false,
          configFields: [
            {
              name: "nchars",
              label: "Number of characters",
              type: "Integer",
              default: 20,
            },
          ],
          description:
            "Show First N characters of text followed by ... if truncated",
          run: (s, req, attrs = {}) => {
            if (!s || !s.length) return "";
            if (s.length <= (attrs.nchars || 20)) return text_attr(s);
            return text_attr(s.substr(0, (attrs.nchars || 20) - 3)) + "...";
          },
        },
      }),
  viewtemplates: () => [
    {
      name: "Tabulator",
      display_state_form: false,
      get_state_fields,
      configuration_workflow: view_configuration_workflow,
      run,
      initial_config,
      configCheck: async (view) => {
        const colcheck = await check_view_columns(
          view,
          view.configuration.columns
        );
        const { errors, warnings } = Array.isArray(colcheck) // legacy
          ? { errors: colcheck, warnings: [] }
          : colcheck;
        const selected_rows_action = view.configuration.selected_rows_action;
        if (selected_rows_action) {
          const trigger = await Trigger.findOne({ name: selected_rows_action });
          if (!trigger)
            errors.push(
              `In view ${view.name}, Trigger for selected_rows_action not found: ` +
                selected_rows_action
            );
          else if (!getState().actions[trigger.action])
            errors.push(
              `In view ${view.name}, Action for selected_rows_action not found: ` +
                trigger.action
            );
        }
        if (view.configuration.ajax_load) {
          const table = await Table.findOne({ id: view.table_id });
          const fields = await table.getFields();
          const { rows } = await get_db_rows(
            table,
            fields,
            view.viewname,
            view.configuration,
            {},
            mockReqRes.req,
            false,
            undefined,
            5
          );
          if (!Array.isArray(rows))
            errors.push(
              `In view ${view.name}, something went wrong when retriving rows.`
            );
        }
        return { errors, warnings };
      },
      routes: {
        run_action,
        get_rows,
        run_selected_rows_action,
        add_preset,
        delete_preset,
      },
      queries: ({ table_id, req }) => ({
        async get_rows_query(where, joinFields, aggregations, q) {
          const table = await Table.findOne({ id: table_id });
          return await table.getJoinedRows({
            where,
            joinFields,
            aggregations,
            ...q,
            forPublic: !req.user,
            forUser: req.user,
          });
        },
      }),
    },
    require("./pivot-edit"),
  ],
  ready_for_mobile: true,
};

const fragment = (...args) => args.filter((s) => s).join("");
