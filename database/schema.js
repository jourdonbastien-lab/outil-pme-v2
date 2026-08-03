'use strict';

function createSqliteTables(database) {
  database.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      address TEXT,
      postal_code TEXT,
      city TEXT,
      email TEXT,
      phone TEXT,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      status TEXT,
      client_id INTEGER,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      start_date TEXT,
      end_date TEXT,
      google_event_id TEXT NULL,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
	      date TEXT NOT NULL,
	      price REAL DEFAULT 0,
        planned_hours REAL DEFAULT 0,
        done_hours REAL DEFAULT 0,
        chantier_status TEXT DEFAULT 'À préparer',
        chantier_start_date TEXT,
        chantier_end_date TEXT,
        chantier_progress REAL DEFAULT 0,
        chantier_notes TEXT,
	      status TEXT DEFAULT 'En cours',
	      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS supplier_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'En cours',
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS chantier_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client TEXT NOT NULL,
      order_name TEXT NOT NULL,
      client_order_id INTEGER NULL,
      work_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      break_minutes INTEGER DEFAULT 0,
      minutes_total INTEGER DEFAULT 0,
      note TEXT,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_order_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      designation TEXT NOT NULL,
      category TEXT,
      qty REAL DEFAULT 1,
      unit TEXT,
      reference TEXT,
      supplier TEXT,
      needed_date TEXT,
      note TEXT,
      status TEXT DEFAULT 'À commander',
      created_at TEXT,
      updated_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_order_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      invoice_number TEXT,
      invoice_date TEXT,
      client_name TEXT,
      amount_ht REAL DEFAULT 0,
      vat_amount REAL DEFAULT 0,
      amount_ttc REAL DEFAULT 0,
      stored_file_name TEXT,
      original_file_name TEXT,
      file_hash TEXT,
      source_type TEXT DEFAULT 'upload',
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS chantiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      client_id INTEGER NULL,
      description TEXT,
      status TEXT DEFAULT 'À préparer',
      planned_hours REAL DEFAULT 0,
      done_hours REAL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      client_name TEXT,
      client_email TEXT,
      client_phone TEXT,
      client_address TEXT,
      status TEXT DEFAULT 'Brouillon',
      vat_rate REAL DEFAULT 20,
      created_at TEXT NOT NULL
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quote_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      category TEXT,
      label TEXT NOT NULL,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL,
      total REAL NOT NULL,
      cost_unit REAL,
      cost_total REAL,
      margin_pct REAL,
      coefficient REAL,
      hours REAL,
      hourly_cost REAL,
      cost_category TEXT,
      cost_source TEXT,
      position INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      name TEXT,
      unit TEXT,
      price REAL NOT NULL DEFAULT 0,
      kg_per_m REAL,
      density REAL,
      created_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT,
      record_name TEXT,
      client TEXT,
      chantier TEXT,
      measure_date TEXT,
      quote_id INTEGER NULL,
      client_order_id INTEGER NULL,
      data TEXT,
      created_at TEXT,
      updated_at TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quote_ai_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      total_ht REAL,
      cost_price REAL,
      margin_amount REAL,
      margin_on_cost REAL,
      margin_on_sale REAL,
      checks_json TEXT,
      ai_response_json TEXT,
      model_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER
    )
  `).run();

  database.prepare('CREATE INDEX IF NOT EXISTS idx_quote_ai_reviews_quote_id_created_at ON quote_ai_reviews(quote_id, created_at DESC, id DESC)').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS quote_profitability_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL UNIQUE,
      material_cost REAL NOT NULL DEFAULT 0,
      laser_cutting_cost REAL NOT NULL DEFAULT 0,
      subcontracting_cost REAL NOT NULL DEFAULT 0,
      galvanizing_cost REAL NOT NULL DEFAULT 0,
      powder_coating_cost REAL NOT NULL DEFAULT 0,
      motorization_cost REAL NOT NULL DEFAULT 0,
      accessories_cost REAL NOT NULL DEFAULT 0,
      transport_cost REAL NOT NULL DEFAULT 0,
      consumables_cost REAL NOT NULL DEFAULT 0,
      rental_cost REAL NOT NULL DEFAULT 0,
      other_cost REAL NOT NULL DEFAULT 0,
      study_hours REAL NOT NULL DEFAULT 0,
      workshop_hours REAL NOT NULL DEFAULT 0,
      installation_hours REAL NOT NULL DEFAULT 0,
      transport_hours REAL NOT NULL DEFAULT 0,
      sav_hours REAL NOT NULL DEFAULT 0,
      hourly_cost REAL NOT NULL DEFAULT 55,
      direct_costs REAL NOT NULL DEFAULT 0,
      labor_cost REAL NOT NULL DEFAULT 0,
      total_cost_price REAL NOT NULL DEFAULT 0,
      work_categories_json TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER
      ,analysis_json TEXT
      ,manual_adjustments_json TEXT
      ,reliability_level TEXT
      ,analyzed_at TEXT
      ,engine_version INTEGER
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_quote_profitability_quote ON quote_profitability_forecasts(quote_id)').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS project_profitability_forecasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER,
      client_order_id INTEGER NOT NULL,
      total_ht REAL NOT NULL DEFAULT 0,
      material_cost REAL NOT NULL DEFAULT 0,
      subcontracting_cost REAL NOT NULL DEFAULT 0,
      galvanizing_cost REAL NOT NULL DEFAULT 0,
      powder_coating_cost REAL NOT NULL DEFAULT 0,
      motorization_cost REAL NOT NULL DEFAULT 0,
      accessories_cost REAL NOT NULL DEFAULT 0,
      transport_cost REAL NOT NULL DEFAULT 0,
      consumables_cost REAL NOT NULL DEFAULT 0,
      rental_cost REAL NOT NULL DEFAULT 0,
      study_hours REAL NOT NULL DEFAULT 0,
      workshop_hours REAL NOT NULL DEFAULT 0,
      installation_hours REAL NOT NULL DEFAULT 0,
      hourly_cost REAL NOT NULL DEFAULT 55,
      forecast_cost REAL NOT NULL DEFAULT 0,
      forecast_margin REAL NOT NULL DEFAULT 0,
      forecast_margin_rate REAL,
      work_category TEXT,
      snapshot_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_profitability_forecasts_order ON project_profitability_forecasts(client_order_id, created_at DESC, id DESC)').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS project_actual_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      cost_type TEXT NOT NULL,
      description TEXT,
      amount_ht REAL NOT NULL DEFAULT 0,
      supplier_invoice_id INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      cost_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_project_actual_costs_order ON project_actual_costs(client_order_id, cost_date, id)').run();
  database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_actual_costs_supplier_invoice ON project_actual_costs(supplier_invoice_id) WHERE supplier_invoice_id IS NOT NULL').run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_order_cost_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_order_id INTEGER NOT NULL,
      line_type TEXT NOT NULL,
      category TEXT,
      designation TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_cost_ht REAL NOT NULL DEFAULT 0,
      unit_sale_ht REAL NOT NULL DEFAULT 0,
      planned_minutes INTEGER NOT NULL DEFAULT 0,
      hourly_cost_ht REAL NOT NULL DEFAULT 0,
      hourly_sale_ht REAL NOT NULL DEFAULT 0,
      supplier TEXT,
      notes TEXT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_quote_line_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(client_order_id) REFERENCES client_orders(id)
    )
  `).run();
  database.prepare('CREATE INDEX IF NOT EXISTS idx_client_order_cost_lines_order_type ON client_order_cost_lines(client_order_id, line_type, sort_order, id)').run();
  database.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_client_order_cost_lines_quote_source ON client_order_cost_lines(client_order_id, source_quote_line_id) WHERE source_quote_line_id IS NOT NULL').run();
  database.prepare(`
    CREATE TABLE IF NOT EXISTS client_order_cost_line_exclusions (
      client_order_id INTEGER NOT NULL,
      source_quote_line_id INTEGER NOT NULL,
      excluded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(client_order_id, source_quote_line_id)
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS measurement_photo_files (
      id TEXT PRIMARY KEY,
      measurement_id INTEGER NOT NULL,
      stored_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      caption TEXT,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(measurement_id, sha256)
    )
  `).run();

  database.prepare('CREATE INDEX IF NOT EXISTS idx_measurement_photo_files_measurement_id ON measurement_photo_files(measurement_id)').run();
}


module.exports = { createSqliteTables };

