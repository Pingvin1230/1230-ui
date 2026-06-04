#!/usr/bin/env python3
"""
Get available models from Hermes configuration
Reads: ~/.hermes/config.yaml and ~/.hermes/.env
Returns: list of available models grouped by provider
"""
import sys
import os
import yaml
from pathlib import Path

def get_available_models():
    hermes_home = Path.home() / '.hermes'
    config_path = hermes_home / 'config.yaml'
    env_path = hermes_home / '.env'
    
    models = {
        'default': None,
        'providers': {}
    }
    
    # Read config.yaml
    if config_path.exists():
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
            
            # Get default model
            if 'model' in config:
                default_model = config['model'].get('default')
                default_provider = config['model'].get('provider')
                if default_model:
                    models['default'] = {
                        'id': default_model,
                        'name': default_model,
                        'provider': default_provider or 'unknown'
                    }
    
    # Read .env to find configured providers
    if env_path.exists():
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                
                if '=' not in line:
                    continue
                
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                
                # Check for provider API keys
                if key == 'MINIMAX_API_KEY' and value:
                    models['providers']['minimax'] = {
                        'id': 'minimax',
                        'name': 'MiniMax',
                        'models': [
                            {'id': 'MiniMax-M2.7', 'name': 'MiniMax M2.7'},
                            {'id': 'abab7-chat', 'name': 'ABAB7 Chat'},
                        ]
                    }
                
                if key == 'ALIBABA_CODING_PLAN_API_KEY' and value:
                    models['providers']['alibaba-coding-plan'] = {
                        'id': 'alibaba-coding-plan',
                        'name': 'Alibaba (Qwen)',
                        'models': [
                            {'id': 'qwen3.6-plus', 'name': 'Qwen 3.6 Plus'},
                            {'id': 'qwen-max', 'name': 'Qwen Max'},
                            {'id': 'qwen-turbo', 'name': 'Qwen Turbo'},
                        ]
                    }
                
                if key == 'OPENROUTER_API_KEY' and value:
                    models['providers']['openrouter'] = {
                        'id': 'openrouter',
                        'name': 'OpenRouter',
                        'models': [
                            {'id': 'anthropic/claude-sonnet-4.6', 'name': 'Claude Sonnet 4.6'},
                            {'id': 'openai/gpt-5.4', 'name': 'GPT-5.4'},
                            {'id': 'google/gemini-3-flash', 'name': 'Gemini 3 Flash'},
                            {'id': 'anthropic/claude-opus-4.6', 'name': 'Claude Opus 4.6'},
                        ]
                    }
                
                if key == 'ANTHROPIC_API_KEY' and value:
                    models['providers']['anthropic'] = {
                        'id': 'anthropic',
                        'name': 'Anthropic',
                        'models': [
                            {'id': 'claude-sonnet-4-20250514', 'name': 'Claude Sonnet 4'},
                            {'id': 'claude-opus-4-20250514', 'name': 'Claude Opus 4'},
                        ]
                    }
                
                if key == 'OPENAI_API_KEY' and value:
                    models['providers']['openai'] = {
                        'id': 'openai',
                        'name': 'OpenAI',
                        'models': [
                            {'id': 'gpt-4-turbo', 'name': 'GPT-4 Turbo'},
                            {'id': 'gpt-4', 'name': 'GPT-4'},
                            {'id': 'gpt-3.5-turbo', 'name': 'GPT-3.5 Turbo'},
                        ]
                    }
    
    return models

if __name__ == '__main__':
    models = get_available_models()
    import json
    print(json.dumps(models, indent=2))
