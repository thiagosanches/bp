# BuyPal

Experience stress-free online shopping with our automation tool. Simply connect your Android device to the USB port, and let BuyPal take care of everything else!

>[!TIP]
>I initially used a playwright approach, which was functional but had the drawback of sessions expiring too quickly and requiring excessive maintenance. Therefore, I switched to using ADB to control a real Android device, and this method has proven to be much more reliable for my needs.

## Overview

BuyPal automates online purchases to reduce anxiety and decision fatigue. It handles the entire checkout process for you, from product selection to payment confirmation.

![alt text](pawelzmarlak-2025-07-09T20_38_14.262Z.png)

### Why BuyPal?

- Eliminates repetitive checking and verification steps
- Reduces decision paralysis during checkout
- Creates a predictable, consistent shopping experience
- Streamlines the purchase process from start to finish

> [!TIP]
> You just need to know where to tap on the screen and follow the necessary steps. In the developer settings, you can enable the display of the X and Y coordinates to identify where to click. Take note of these coordinates and implement them in your code.

### Web Interface

BuyPal includes a user-friendly web interface that allows you to:

1. Create a list of products you're considering
2. Let BuyPal randomly select one item from your list
3. Automatically complete the purchase process

To access the web interface, simply navigate to http://localhost:3000 after starting the server.

### Supported Platforms

- AliExpress (NEEDS UPDATE)
- MercadoLivre

## Quick Start

**Prerequisites:** Node.js (v22+) and Chrome

```bash
# Clone and setup
git clone https://github.com/thiagosanches/buypal.git
cd buypal
npm install
cp .env.example .env  # Configure with your credentials

# Run the application
google-chrome --remote-debugging-port=9222  --user-data-dir=user-data # In terminal 1
npm start  # In terminal 2

# Make a purchase
curl http://localhost:3000/buy/[domain]/[encoded-product-url]
```

## Security & Privacy

All sensitive information is stored locally in your `.env` file and never shared externally.

## Contributing

Contributions to improve the tool or add support for more platforms are welcome! Please submit PRs or open issues with suggestions.

## License

[MIT License](LICENSE)
