#!/bin/bash

echo "🚀 Migrating Claire project to Bun runtime..."
echo ""

# Check if Bun is installed
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is not installed. Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    
    # Add Bun to PATH for current session
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    
    echo "✅ Bun installed successfully!"
else
    echo "✅ Bun is already installed: $(bun --version)"
fi

echo ""
echo "🧹 Cleaning up npm/yarn artifacts..."

# Remove node_modules and lock files
rm -rf node_modules
rm -rf server/node_modules
rm -rf client/node_modules
rm -f package-lock.json
rm -f yarn.lock
rm -f server/package-lock.json
rm -f server/yarn.lock
rm -f client/package-lock.json
rm -f client/yarn.lock

echo "✅ Cleanup complete!"
echo ""

echo "📦 Installing dependencies with Bun..."
bun install

echo ""
echo "✅ Migration complete!"
echo ""
echo "🎉 You can now use Bun commands:"
echo "  - bun install    (install dependencies)"
echo "  - bun run dev    (start development servers)"
echo "  - bun test       (run tests)"
echo "  - bun run build  (build the project)"
echo ""
echo "📚 For more information, check the updated README.md"