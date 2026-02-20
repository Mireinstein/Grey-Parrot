from anthropic import Anthropic


class ClaudeService:
    def __init__(self, api_key):
        self.client = Anthropic(api_key=api_key)

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """
        Translate text using Claude.
        """
        lang_names = {
            'es': 'Spanish',
            'en': 'English',
            'fr': 'French',
            'zh': 'Mandarin Chinese'
        }

        source = lang_names.get(source_lang, source_lang)
        target = lang_names.get(target_lang, target_lang)

        prompt = f"""You are a professional translator for customer support calls.

Translate this {source} text to {target}.

Rules:
1. Maintain tone and formality
2. Keep support terminology accurate
3. Preserve empathy and politeness
4. Return ONLY the translation - no explanations

{source} text:
{text}

{target} translation:"""

        message = self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt}]
        )

        return message.content[0].text.strip()
