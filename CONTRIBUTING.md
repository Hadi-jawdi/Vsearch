# Contributing to Vsearch

Thank you for your interest in contributing to Vsearch! This document provides guidelines and instructions for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with the following information:

1. A clear, descriptive title
2. Steps to reproduce the issue
3. Expected behavior
4. Actual behavior
5. Screenshots (if applicable)
6. Environment information (browser, OS, etc.)

### Suggesting Features

We welcome feature suggestions! Please create an issue with:

1. A clear, descriptive title
2. Detailed description of the proposed feature
3. Any relevant examples or mockups
4. Explanation of why this feature would be useful

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Run tests and ensure code quality
5. Commit your changes (`git commit -m 'Add some feature'`)
6. Push to the branch (`git push origin feature/your-feature-name`)
7. Open a Pull Request

## Development Setup

1. Clone the repository
   ```bash
   git clone https://github.com/Hadi-jawdi/Vsearch.git
   cd Vsearch
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Run the development server
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

- `components/`: React components
- `pages/`: Next.js pages and API routes
- `utils/`: Utility functions and modules
  - `search-engines/`: Search engine implementations
  - `extraction.ts`: Content extraction utilities
  - `http.ts`: HTTP utilities
  - `scraper.ts`: Web scraping functionality
  - `theme.ts`: Theme management
  - `history.ts`: History management
- `types/`: TypeScript type definitions
- `styles/`: Global styles
- `public/`: Static assets

## Coding Standards

- Use TypeScript for type safety
- Follow the existing code style
- Write meaningful commit messages
- Add comments for complex logic
- Update documentation when necessary

## Testing

- Test your changes thoroughly
- Ensure the application works in different browsers
- Verify mobile responsiveness

## License

By contributing to Vsearch, you agree that your contributions will be licensed under the project's [MIT License](./license).
