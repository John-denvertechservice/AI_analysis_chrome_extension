# Changelog

All notable changes to the AI Analyze Selection Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Claude Model Selection**: Restricted to Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Opus only
- Removed deprecated Claude 3 Sonnet and Claude 3 Haiku from model selection
- Updated migration logic to automatically upgrade users from old Claude 3 Sonnet/Haiku to Claude 3.5 Sonnet
- Updated all documentation to reflect current model availability

### Added
- GitHub repository setup
- Comprehensive documentation
- MIT License
- Proper project structure

## [0.6.0] - 2024-12-16

### Added
- Enhanced Claude 3.5 Sonnet integration with latest API features
- Support for current Claude models (3.5 Sonnet, 3.5 Haiku, 3 Opus)
- Claude 3.5 Sonnet as the default Claude model
- Beta API features support for enhanced capabilities
- Increased token limits (2000 max tokens) for more comprehensive responses
- Improved error handling and fallback mechanisms
- **Decision Tree Integration**: Standardized AI behavior across all models following structured decision tree rules
- **Consistent Response Patterns**: All models now follow the same decision tree for when to include/exclude Final Answer sections

### Changed
- Updated Claude API headers to use latest beta features
- Enhanced model selection with comprehensive Claude model options
- Improved migration logic to default to Claude 3.5 Sonnet
- Increased response quality with higher token limits
- Updated extension version to 0.6.0
- **System Prompts**: Completely restructured to follow decision tree rules exactly
- **Response Logic**: Implemented structured decision tree for consistent AI behavior

### Technical Details
- Added `anthropic-beta: tools-2024-05-16` header for latest features
- Enhanced model fallback system for better reliability
- Improved API error handling with detailed error messages
- Updated all Claude API calls to use latest best practices
- Maintained backward compatibility with existing functionality
- **Decision Tree Implementation**: 
  - Text over 75 words: Summarize + ask how to proceed (no Final Answer)
  - Fill-in-the-blank: Return most likely answer (with Final Answer)
  - Questions: Answer directly (with Final Answer)
  - Matter-of-fact statements: Brief summary + ask how to proceed (no Final Answer)
  - Commands: Execute and return result (with Final Answer)
  - Code: Identify language + summarize (no Final Answer)
  - Images with text: Apply word rules to extracted text
  - Images without text: Descriptive analysis (no Final Answer)

### Features
- **Claude Models**: Claude 3.5 Sonnet (default), 3.5 Haiku, 3 Opus
- **Enhanced Responses**: Up to 2000 tokens for more detailed analysis
- **Beta Features**: Access to latest Claude API capabilities
- **Better Error Handling**: Improved fallback and error messages
- **Model Migration**: Automatic upgrade to latest Claude models
- **Decision Tree**: Consistent AI behavior across all providers and models
- **Standardized Responses**: Predictable Final Answer inclusion/exclusion based on content type

## [0.4.0] - 2024-12-16

### Added
- AI image analysis capabilities using OpenAI Vision API
- Support for analyzing PNG, JPG, GIF, and other image formats
- Image preview in analysis results with professional styling
- Interactive conversations about images with follow-up questions
- Automatic image detection when selecting images on web pages
- High-detail image analysis using GPT-4o model
- Image-to-base64 conversion for API compatibility

### Changed
- Updated extension description to include image analysis
- Enhanced UI to support both text and image analysis
- Improved conversation flow for image-based discussions
- Updated documentation with image analysis features

### Technical Details
- Integrated OpenAI Vision API with GPT-4o model
- Added image selection and detection functionality
- Implemented base64 image conversion for API calls
- Enhanced conversation system for image analysis
- Added specialized prompts for visual content analysis

## [0.3.1] - 2024-12-16

### Removed
- Plotly charting and visualization functionality
- Chart generation prompts and code
- Chart-related CSS styles and containers
- External Plotly library dependencies

### Changed
- Simplified AI responses to focus on text analysis only
- Streamlined system prompts without visualization instructions
- Reduced extension complexity and dependencies

### Technical Details
- Removed all chart-related functions from content script
- Cleaned up background script prompts
- Eliminated external library loading requirements
- Maintained all conversation and analysis functionality

## [0.3.0] - 2024-12-16

### Added
- Interactive conversation feature for follow-up questions
- User input field with 50-word limit validation
- Conversation history display
- Real-time word count indicator
- Follow-up request handling with context awareness
- Enhanced UI with conversation interface
- Auto-resizing textarea for user input
- Enter key support for sending messages

### Changed
- Enhanced overlay interface to support two-way conversation
- Updated message handling to support conversation flow
- Improved user experience with interactive responses
- Extended AI analysis capabilities with contextual follow-ups

### Technical Details
- Maintains conversation context across multiple interactions
- Smart prompt engineering for follow-up responses
- Robust error handling for conversation requests
- Seamless integration with existing ChatGPT 5 Mini functionality

## [0.2.0] - 2024-12-16

### Added
- ChatGPT 5 Mini integration as the new default model
- Support for gpt-5-mini model in options
- Updated model selection dropdown with ChatGPT 5 Mini option

### Changed
- Default model changed from gpt-4 to gpt-5-mini
- Updated extension description to mention ChatGPT 5 Mini
- Version bumped to 0.2.0 to reflect the major model upgrade

### Technical Details
- Maintains backward compatibility with existing models
- All existing features preserved with new model capabilities
- Enhanced AI analysis with ChatGPT 5 Mini's improved performance

## [0.1.0] - 2024-12-16

### Added
- Initial release of AI Analyze Selection Chrome Extension
- AI text analysis using GPT-4
- Mathematical problem solving with step-by-step solutions
- Interactive charting system for data visualization
- Dark theme interface with white text
- Toggle functionality (open/close with same hotkey)
- Copy to clipboard functionality
- Timestamp display for analysis
- Smooth fade-in/fade-out animations
- Smart content detection (math vs. general text)
- Bold formatting for final answers
- Italic formatting for verification steps
- Markdown support for **bold** and *italic* text
- Canvas-based charting system (CSP compliant)
- Support for line charts and scatter plots
- Automatic chart scaling and grid display
- Professional chart styling with dark theme
- Error handling and fallback messages
- Loading animations with spinner
- Bottom-right corner positioning
- Inter font for improved readability
- Thick white border for visual emphasis
- Friendly bubble message for no text selection
- Comprehensive system prompts for different content types
- OpenAI API integration with configurable models
- Chrome Extension Manifest V3 compliance
- Secure API key storage in Chrome sync
- Content Security Policy compliance
- No external dependencies for charting

### Technical Details
- Built with Chrome Extension Manifest V3
- Uses OpenAI GPT-4 API for AI analysis
- Custom Canvas-based charting system
- Inter font for optimal readability
- Secure local storage for API keys
- CSP-compliant architecture
- No external script dependencies

### Features
- **Keyboard Shortcut**: Alt+Shift+A (Windows/Linux) or Cmd+Shift+A (Mac)
- **AI Models**: GPT-4 (configurable)
- **Chart Types**: Line charts, scatter plots
- **Theme**: Dark background with white text
- **Animations**: Smooth transitions and loading states
- **Positioning**: Bottom-right corner overlay
- **Toggle**: Same hotkey to open/close
- **Copy**: One-click copying of AI responses
- **Timestamp**: Shows when analysis was performed

### Security
- No personal data collection
- Local API key storage only
- Direct OpenAI API communication
- No third-party data sharing
- CSP-compliant implementation
