package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// User represents a system staff or admin account
type User struct {
	ID           string     `json:"id" db:"id"`
	FullName     string     `json:"fullName" db:"full_name"`
	Username     string     `json:"username" db:"username"`
	PasswordHash string     `json:"-" db:"password_hash"`
	Role         string     `json:"role" db:"role"`
	Capabilities string     `json:"capabilities" db:"capabilities"`
	Status       string     `json:"status" db:"status"`
	CreatedAt    time.Time  `json:"createdAt" db:"created_at"`
	LastLogin    *time.Time `json:"lastLogin,omitempty" db:"last_login"`
}

// Category represents a store product category managed by Admin
type Category struct {
	ID          string    `json:"id" db:"id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// Product represents store inventory catalog items
type Product struct {
	ID             string    `json:"id" db:"id"`
	Barcode        string    `json:"barcode" db:"barcode"`
	Name           string    `json:"name" db:"name"`
	CategoryName   string    `json:"category" db:"category_name"`
	Unit           string    `json:"unit" db:"unit"`
	CostPrice      float64   `json:"costPrice" db:"cost_price"`
	RetailPrice    float64   `json:"retailPrice" db:"retail_price"`
	WholesalePrice float64   `json:"wholesalePrice" db:"wholesale_price"`
	StockQty       int       `json:"stockQty" db:"stock_qty"`
	ReorderLevel   int       `json:"reorderLevel" db:"reorder_level"`
	CreatedAt      time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt      time.Time `json:"updatedAt" db:"updated_at"`
}

// Customer represents customer profiles, debt ledgers & loyalty
type Customer struct {
	ID             string    `json:"id" db:"id"`
	FullName       string    `json:"fullName" db:"full_name"`
	AccountType    string    `json:"accountType" db:"account_type"`
	Phone          string    `json:"phone" db:"phone"`
	Address        string    `json:"address" db:"address"`
	Balance        float64   `json:"balance" db:"balance"`
	Points         int       `json:"points" db:"points"`
	AdvancePayment float64   `json:"advancePayment" db:"advance_payment"`
	AssignedCashier string   `json:"assignedCashier" db:"assigned_cashier"`
	CreatedAt      time.Time `json:"createdAt" db:"created_at"`
}

// SaleRecord header for completed checkout transactions
type SaleRecord struct {
	ID              string     `json:"id" db:"id"`
	ReceiptNo       string     `json:"receiptNo" db:"receipt_no"`
	Subtotal        float64    `json:"subtotal" db:"subtotal"`
	TotalAmount     float64    `json:"totalAmount" db:"total_amount"`
	AdvancePayment  float64    `json:"advancePayment" db:"advance_payment"`
	BalanceDue      float64    `json:"balanceDue" db:"balance_due"`
	PaymentMethod   string     `json:"paymentMethod" db:"payment_method"`
	PriceType       string     `json:"priceType" db:"price_type"`
	CustomerID      *string    `json:"customerId,omitempty" db:"customer_id"`
	CustomerName    *string    `json:"customerName,omitempty" db:"customer_name"`
	CustomerPhone   *string    `json:"customerPhone,omitempty" db:"customer_phone"`
	PointsEarned    int        `json:"pointsEarned" db:"points_earned"`
	CashierUsername string     `json:"cashier" db:"cashier_username"`
	SaleDate        string     `json:"date" db:"sale_date"`
	SaleTime        string     `json:"time" db:"sale_time"`
	CreatedAt       time.Time  `json:"createdAt" db:"created_at"`
	Items           []SaleItem `json:"items" db:"-"`
}

// SaleItem represents individual line items within a receipt
type SaleItem struct {
	ID          string  `json:"id" db:"id"`
	SaleID      string  `json:"saleId" db:"sale_id"`
	ProductID   string  `json:"productId" db:"product_id"`
	ProductName string  `json:"productName" db:"product_name"`
	Quantity    int     `json:"quantity" db:"quantity"`
	PriceType   string  `json:"priceType" db:"price_type"`
	Rate        float64 `json:"rate" db:"rate"`
	Amount      float64 `json:"amount" db:"amount"`
}

// Expenditure records operational store expenses
type Expenditure struct {
	ID          string    `json:"id" db:"id"`
	Description string    `json:"description" db:"description"`
	Category    string    `json:"category" db:"category"`
	Amount      float64   `json:"amount" db:"amount"`
	ExpenseDate string    `json:"date" db:"expense_date"`
	CreatedBy   string    `json:"createdBy" db:"created_by"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

// ThermalPrinterConfig stores print layout settings
type ThermalPrinterConfig struct {
	ID                int    `json:"id" db:"id"`
	StoreName         string `json:"storeName" db:"store_name"`
	Tagline           string `json:"tagline" db:"tagline"`
	Address           string `json:"address" db:"address"`
	Phone             string `json:"phone" db:"phone"`
	ReceiptHeaderNote string `json:"receiptHeaderNote" db:"receipt_header_note"`
	ReceiptFooterNote string `json:"receiptFooterNote" db:"receipt_footer_note"`
	ShowLogo          bool   `json:"showLogo" db:"show_logo"`
	PaperWidth        string `json:"paperWidth" db:"paper_width"`
	AutoPrintOnSale   bool   `json:"autoPrintOnSale" db:"auto_print_on_sale"`
	PointRate         int    `json:"pointRate" db:"point_rate"`
	PrintDensity      string `json:"printDensity" db:"print_density"`
}

// AuditLog tracks administrative & terminal actions
type AuditLog struct {
	ID           string `json:"id" db:"id"`
	Username     string `json:"username" db:"username"`
	UserRole     string `json:"userRole" db:"user_role"`
	Action       string `json:"action" db:"action"`
	Details      string `json:"details" db:"details"`
	LogTimestamp int64  `json:"timestamp" db:"log_timestamp"`
	LogDate      string `json:"date" db:"log_date"`
	LogTime      string `json:"time" db:"log_time"`
}

// InitSQLite initializes SQLite database with WAL mode for Go / Tauri desktop bundles
func InitSQLite(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", fmt.Sprintf("%s?_journal_mode=WAL&_foreign_keys=on", dbPath))
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(1 * time.Hour)

	log.Println("SQLite WAL Database connected successfully for Go Tauri POS Backend.")
	return db, nil
}
