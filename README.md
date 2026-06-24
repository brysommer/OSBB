# FUELBOT - Telegram Fuel Management System

A comprehensive Telegram-based solution for fuel expense tracking and fleet management analytics.

## 🚀 Overview

FUELBOT is a Node.js application that provides automated fuel expense tracking through Telegram bots. It allows drivers to easily register fuel purchases and administrators to generate detailed reports and analytics.

## ✨ Features

### For Drivers
- **Easy Registration**: Share phone number and register vehicle details
- **One-Click Fuel Recording**: Simple button to start fuel registration process
- **Step-by-Step Input**: Guided process for volume, price, odometer, and comments
- **Photo Upload**: Automatic forwarding of odometer and receipt photos to admin group
- **Persistent Interface**: "Заправка⛽️" button always available

### For Administrators
- **Driver Management**: View all registered drivers
- **Periodic Statistics**: Weekly, monthly, and all-time reports
- **Financial Analytics**: Cost per kilometer, fuel consumption analysis
- **CSV Export**: Detailed reports in CSV format with all transaction data
- **Real-time Logging**: All fuel records automatically logged to admin group

## 🏗️ Architecture

- **Backend**: Node.js with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Bots**: Three separate Telegram bots (main, logger, admin)
- **Reports**: CSV export with UTF-8 encoding support

## 📊 Database Schema

### Driver Model
```prisma
model Driver {
  id         Int          @id @default(autoincrement())
  firstName  String?
  phone      String       @unique
  carNumber  String       @unique
  tankVolume Int?
  chatId     BigInt       @unique
  step       Int
  createdAt  DateTime     @default(now())
  fuelRecords FuelRecord[]
}
```

### FuelRecord Model
```prisma
model FuelRecord {
  id          Int      @id @default(autoincrement())
  driverId    Int
  driver      Driver   @relation(fields: [driverId], references: [id])
  volume      Float    // Fuel volume in liters
  price       Float    // Price per liter
  odometr     BigInt?  // Odometer reading
  total       Float    // Total cost (volume * price)
  date        DateTime @default(now())
  createdAt   DateTime @default(now())
  comment     String?  // Optional comment
}
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- Telegram Bot API tokens

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/brysommer/FUELBOT.git
   cd FUELBOT
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/fuelbot"
   
   # Telegram Bot Tokens
   TELEGRAM_BOT_TOKEN="your_main_bot_token"
   TELEGRAM_LOGGER_BOT_TOKEN="your_logger_bot_token"
   ADMIN_BOT_BOT="your_admin_bot_token"
   
   # Logger Group
   LOGGER_CHAT="your_logger_group_chat_id"
   ```

4. **Set up the database**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run database migrations
   npx prisma db push
   ```

5. **Create temporary directory**
   ```bash
   mkdir tmp
   ```

6. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run build
   npm start
   ```

## 📱 Bot Setup

### Main Bot (Driver Interface)
- Handles driver registration and fuel recording
- Commands: `/start`, `/zapravka`
- Features: Contact sharing, step-by-step input, photo forwarding

### Logger Bot
- Forwards fuel records and photos to admin group
- Provides real-time logging of all activities
- Sends formatted messages with driver and fuel information

### Admin Bot
- Provides administrative interface
- Commands: `/start`
- Features: Driver selection, statistics, CSV export

## 🔧 Usage

### Driver Registration Process
1. Driver starts bot with `/start`
2. Shares phone number via "Надіслати контакт" button
3. Enters car number
4. Specifies tank volume
5. Registration complete - "Заправка⛽️" button appears

### Fuel Recording Process
1. Driver clicks "Заправка⛽️" button
2. Enters fuel volume (liters)
3. Enters price per liter
4. Enters current odometer reading
5. Adds optional comment
6. Can send photos of odometer and receipt
7. Record automatically logged to admin group

### Admin Statistics
1. Admin starts admin bot with `/start`
2. Selects driver from list
3. Chooses time period (week/month/all-time)
4. Views calculated statistics:
   - Total fuel consumption
   - Total costs
   - Distance traveled
   - Cost per kilometer
   - Average fuel consumption (L/100km)
5. Option to export data to CSV

## 📊 Analytics Formulas

- **Distance**: `current_odometer - previous_odometer`
- **Total Cost**: `liters × price_per_liter`
- **Cost per Kilometer**: `total_cost / distance`
- **Fuel Consumption**: `(liters / distance) × 100`

## 🛠️ Development

### Project Structure
```
FUELBOT/
├── src/
│   ├── index.ts              # Main application entry
│   ├── fuel-record.ts        # Fuel recording logic
│   ├── forward-pictures.ts   # Photo forwarding
│   ├── admin-bot.ts          # Admin interface
│   ├── export-csv.ts         # CSV export functionality
│   ├── lib/
│   │   └── prisma.ts         # Database client
│   └── prisma/
│       └── schema.prisma     # Database schema
├── package.json
├── tsconfig.json
└── README.md
```

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests (not implemented)

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `TELEGRAM_BOT_TOKEN` | Main bot token | Yes |
| `TELEGRAM_LOGGER_BOT_TOKEN` | Logger bot token | Yes |
| `ADMIN_BOT_BOT` | Admin bot token | Yes |
| `LOGGER_CHAT` | Admin group chat ID | Yes |

## 🔒 Security Considerations

- All sensitive data stored in environment variables
- Database connections use secure protocols
- Telegram API tokens should be kept confidential
- Regular database backups recommended
- Monitor bot access and usage

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify DATABASE_URL in .env file
   - Ensure PostgreSQL is running
   - Check database permissions

2. **Bot Not Responding**
   - Verify bot tokens are correct
   - Check internet connection
   - Ensure bots are not blocked

3. **CSV Export Fails**
   - Ensure `tmp` directory exists
   - Check file permissions
   - Verify data exists for selected period

### Logs
- Application logs are printed to console
- Database queries are logged (can be disabled in production)
- Telegram API errors are handled gracefully

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 📞 Support

For technical support or questions:
- Create an issue on GitHub
- Contact the development team
- Check the documentation

---

**FUELBOT** - Streamlining fuel expense management through intelligent automation.
