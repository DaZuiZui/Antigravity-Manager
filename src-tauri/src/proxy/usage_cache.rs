use crate::proxy::config::{get_cache_management_config, CacheManagementConfig};
use rand::Rng;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const FIVE_MINUTE_BUCKET: &str = "5m";
const ONE_HOUR_BUCKET: &str = "1h";

#[derive(Debug, Clone)]
struct FakeCacheState {
    cached_tokens: u32,
    expires_at: Instant,
}

#[derive(Debug, Clone, Copy)]
pub struct FakeCacheSplit {
    pub input_tokens: u32,
    pub cache_read_tokens: u32,
    pub cache_write_tokens: u32,
    pub cache_write_5m_tokens: u32,
    pub cache_write_1h_tokens: u32,
}

static FAKE_CACHE_STATE: OnceLock<Mutex<HashMap<String, FakeCacheState>>> = OnceLock::new();

fn fake_cache_state() -> &'static Mutex<HashMap<String, FakeCacheState>> {
    FAKE_CACHE_STATE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn clamp_ratio(value: f64, default: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        default
    }
}

fn non_negative_finite(value: f64, default: f64) -> f64 {
    if value.is_finite() && value >= 0.0 {
        value
    } else {
        default
    }
}

pub fn normalized_cache_settings() -> CacheManagementConfig {
    let raw = get_cache_management_config();
    let mut min_ratio = clamp_ratio(raw.min_ratio, 0.75);
    let mut max_ratio = clamp_ratio(raw.max_ratio, 0.85);
    if min_ratio > max_ratio {
        std::mem::swap(&mut min_ratio, &mut max_ratio);
    }

    let mut read_split_min_ratio = clamp_ratio(raw.read_split_min_ratio, 0.75);
    let mut read_split_max_ratio = clamp_ratio(raw.read_split_max_ratio, 0.85);
    if read_split_min_ratio > read_split_max_ratio {
        std::mem::swap(&mut read_split_min_ratio, &mut read_split_max_ratio);
    }

    CacheManagementConfig {
        enabled: raw.enabled,
        min_ratio,
        max_ratio,
        read_split_min_ratio,
        read_split_max_ratio,
        read_multiplier: non_negative_finite(raw.read_multiplier, 1.0),
        write_multiplier: non_negative_finite(raw.write_multiplier, 1.0),
        cache_read_multiplier: non_negative_finite(raw.cache_read_multiplier, 1.0),
        cache_write_multiplier: non_negative_finite(raw.cache_write_multiplier, 1.0),
        state_ttl_seconds: raw.state_ttl_seconds.max(1),
        one_hour_state_ttl_seconds: raw.one_hour_state_ttl_seconds.max(1),
        one_hour_write_ratio: clamp_ratio(raw.one_hour_write_ratio, 0.20),
    }
}

pub fn multiply_token_count(value: u32, multiplier: f64) -> u32 {
    let safe_multiplier = non_negative_finite(multiplier, 1.0);
    ((value as f64) * safe_multiplier)
        .round()
        .clamp(0.0, u32::MAX as f64) as u32
}

fn bucket_key(cache_key: &str, bucket: &str) -> String {
    format!("{}::{}", cache_key, bucket)
}

fn get_bucket_cached_tokens(cache_key: &str, bucket: &str, now: Instant) -> u32 {
    let key = bucket_key(cache_key, bucket);
    let Ok(mut state) = fake_cache_state().lock() else {
        return 0;
    };

    let Some(entry) = state.get(&key) else {
        return 0;
    };

    if entry.expires_at <= now {
        state.remove(&key);
        0
    } else {
        entry.cached_tokens
    }
}

fn store_bucket_cached_tokens(
    cache_key: &str,
    bucket: &str,
    cached_tokens: u32,
    ttl_seconds: u64,
    now: Instant,
) {
    if cached_tokens == 0 {
        return;
    }

    let Ok(mut state) = fake_cache_state().lock() else {
        return;
    };

    state.insert(
        bucket_key(cache_key, bucket),
        FakeCacheState {
            cached_tokens,
            expires_at: now + Duration::from_secs(ttl_seconds),
        },
    );
}

fn random_ratio(min: f64, max: f64) -> f64 {
    if (max - min).abs() < f64::EPSILON {
        min
    } else {
        rand::thread_rng().gen_range(min..=max)
    }
}

fn split_cache_write_tokens(
    cache_write_tokens: u32,
    settings: &CacheManagementConfig,
) -> (u32, u32) {
    let one_hour = ((cache_write_tokens as f64) * settings.one_hour_write_ratio)
        .floor()
        .clamp(0.0, cache_write_tokens as f64) as u32;
    let five_minute = cache_write_tokens.saturating_sub(one_hour);
    (five_minute, one_hour)
}

fn build_stateless_fake_cache_split(
    input_tokens: u32,
    settings: &CacheManagementConfig,
) -> FakeCacheSplit {
    if input_tokens == 0 {
        return FakeCacheSplit {
            input_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cache_write_5m_tokens: 0,
            cache_write_1h_tokens: 0,
        };
    }

    let cache_ratio = random_ratio(settings.min_ratio, settings.max_ratio);
    let mut cache_total_tokens = ((input_tokens as f64) * cache_ratio).floor() as u32;
    cache_total_tokens = cache_total_tokens.clamp(1, input_tokens);

    let (cache_read_tokens, cache_write_tokens) = if cache_total_tokens == 1 {
        (1, 0)
    } else {
        let read_split_ratio =
            random_ratio(settings.read_split_min_ratio, settings.read_split_max_ratio);
        let mut cache_read_tokens = ((cache_total_tokens as f64) * read_split_ratio).floor() as u32;
        cache_read_tokens = cache_read_tokens.clamp(1, cache_total_tokens - 1);
        (cache_read_tokens, cache_total_tokens - cache_read_tokens)
    };

    let (cache_write_5m_tokens, cache_write_1h_tokens) =
        split_cache_write_tokens(cache_write_tokens, settings);

    FakeCacheSplit {
        input_tokens: input_tokens.saturating_sub(cache_total_tokens),
        cache_read_tokens,
        cache_write_tokens,
        cache_write_5m_tokens,
        cache_write_1h_tokens,
    }
}

pub fn build_fake_cache_split(input_tokens: u32, cache_key: Option<&str>) -> FakeCacheSplit {
    let settings = normalized_cache_settings();
    if input_tokens == 0 {
        return build_stateless_fake_cache_split(input_tokens, &settings);
    }

    let Some(cache_key) = cache_key.filter(|key| !key.trim().is_empty()) else {
        return build_stateless_fake_cache_split(input_tokens, &settings);
    };

    let now = Instant::now();
    let previous_5m_cached_tokens = get_bucket_cached_tokens(cache_key, FIVE_MINUTE_BUCKET, now);
    let previous_1h_cached_tokens = get_bucket_cached_tokens(cache_key, ONE_HOUR_BUCKET, now);
    let previous_cached_tokens = previous_5m_cached_tokens + previous_1h_cached_tokens;

    let (
        input_tokens,
        cache_read_tokens,
        cache_read_5m_tokens,
        cache_read_1h_tokens,
        cache_write_tokens,
    ) = if previous_cached_tokens == 0 {
        let cache_ratio = random_ratio(settings.min_ratio, settings.max_ratio);
        let mut cache_write_tokens = ((input_tokens as f64) * cache_ratio).floor() as u32;
        cache_write_tokens = cache_write_tokens.clamp(1, input_tokens);
        (
            input_tokens.saturating_sub(cache_write_tokens),
            0,
            0,
            0,
            cache_write_tokens,
        )
    } else {
        let cache_read_tokens = previous_cached_tokens.min(input_tokens.saturating_sub(1));
        let cache_read_5m_tokens = previous_5m_cached_tokens.min(cache_read_tokens);
        let cache_read_1h_tokens = cache_read_tokens.saturating_sub(cache_read_5m_tokens);
        let uncached_tokens = input_tokens.saturating_sub(cache_read_tokens);

        if uncached_tokens == 0 {
            (
                0,
                cache_read_tokens,
                cache_read_5m_tokens,
                cache_read_1h_tokens,
                0,
            )
        } else {
            let cache_ratio = random_ratio(settings.min_ratio, settings.max_ratio);
            let mut cache_write_tokens = ((uncached_tokens as f64) * cache_ratio).floor() as u32;
            cache_write_tokens = cache_write_tokens.min(uncached_tokens);
            (
                uncached_tokens.saturating_sub(cache_write_tokens),
                cache_read_tokens,
                cache_read_5m_tokens,
                cache_read_1h_tokens,
                cache_write_tokens,
            )
        }
    };

    let (cache_write_5m_tokens, cache_write_1h_tokens) =
        split_cache_write_tokens(cache_write_tokens, &settings);

    store_bucket_cached_tokens(
        cache_key,
        FIVE_MINUTE_BUCKET,
        cache_read_5m_tokens + cache_write_5m_tokens,
        settings.state_ttl_seconds,
        now,
    );
    store_bucket_cached_tokens(
        cache_key,
        ONE_HOUR_BUCKET,
        cache_read_1h_tokens + cache_write_1h_tokens,
        settings.one_hour_state_ttl_seconds,
        now,
    );

    FakeCacheSplit {
        input_tokens,
        cache_read_tokens,
        cache_write_tokens,
        cache_write_5m_tokens,
        cache_write_1h_tokens,
    }
}

pub fn record_observed_cache_state(
    cache_key: Option<&str>,
    cache_read_tokens: u32,
    cache_write_5m_tokens: u32,
    cache_write_1h_tokens: u32,
) {
    let Some(cache_key) = cache_key.filter(|key| !key.trim().is_empty()) else {
        return;
    };
    let settings = normalized_cache_settings();
    let now = Instant::now();
    store_bucket_cached_tokens(
        cache_key,
        FIVE_MINUTE_BUCKET,
        cache_read_tokens + cache_write_5m_tokens,
        settings.state_ttl_seconds,
        now,
    );
    store_bucket_cached_tokens(
        cache_key,
        ONE_HOUR_BUCKET,
        cache_write_1h_tokens,
        settings.one_hour_state_ttl_seconds,
        now,
    );
}

pub fn apply_fake_cache_to_openai_usage(
    usage: &mut crate::proxy::mappers::openai::models::OpenAIUsage,
    cache_key: Option<&str>,
) {
    let settings = normalized_cache_settings();
    if !settings.enabled {
        return;
    }

    let original_prompt_tokens = usage.original_prompt_tokens.unwrap_or(usage.prompt_tokens);
    let original_completion_tokens = usage
        .original_completion_tokens
        .unwrap_or(usage.completion_tokens);
    let original_total_tokens = original_prompt_tokens + original_completion_tokens;

    usage.original_prompt_tokens = Some(original_prompt_tokens);
    usage.original_completion_tokens = Some(original_completion_tokens);
    usage.original_total_tokens = Some(original_total_tokens);

    if usage.prompt_tokens_details.is_none() {
        usage.prompt_tokens_details =
            Some(crate::proxy::mappers::openai::models::PromptTokensDetails {
                cached_tokens: None,
                cached_creation_tokens: None,
            });
    }

    let real_cache_read_tokens = usage
        .prompt_tokens_details
        .as_ref()
        .and_then(|details| details.cached_tokens)
        .unwrap_or(0);
    let real_cache_write_tokens = usage
        .prompt_tokens_details
        .as_ref()
        .and_then(|details| details.cached_creation_tokens)
        .unwrap_or(0);

    if real_cache_read_tokens > 0 || real_cache_write_tokens > 0 {
        record_observed_cache_state(
            cache_key,
            real_cache_read_tokens,
            real_cache_write_tokens,
            0,
        );
        usage.prompt_tokens = multiply_token_count(usage.prompt_tokens, settings.read_multiplier);
        usage.completion_tokens =
            multiply_token_count(usage.completion_tokens, settings.write_multiplier);
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
        if let Some(prompt_details) = usage.prompt_tokens_details.as_mut() {
            prompt_details.cached_tokens = prompt_details
                .cached_tokens
                .map(|v| multiply_token_count(v, settings.cache_read_multiplier));
            prompt_details.cached_creation_tokens = prompt_details
                .cached_creation_tokens
                .map(|v| multiply_token_count(v, settings.cache_write_multiplier));
        }
        usage.claude_cache_creation_5_m_tokens = usage
            .claude_cache_creation_5_m_tokens
            .map(|v| multiply_token_count(v, settings.cache_write_multiplier));
        usage.claude_cache_creation_1_h_tokens = usage
            .claude_cache_creation_1_h_tokens
            .map(|v| multiply_token_count(v, settings.cache_write_multiplier));
        return;
    }

    if original_prompt_tokens == 0 {
        usage.prompt_tokens = multiply_token_count(usage.prompt_tokens, settings.read_multiplier);
        usage.completion_tokens =
            multiply_token_count(usage.completion_tokens, settings.write_multiplier);
        usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
        return;
    }

    let split = build_fake_cache_split(original_prompt_tokens, cache_key);
    usage.prompt_tokens = multiply_token_count(split.input_tokens, settings.read_multiplier);
    usage.completion_tokens =
        multiply_token_count(original_completion_tokens, settings.write_multiplier);
    usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
    if let Some(prompt_details) = usage.prompt_tokens_details.as_mut() {
        prompt_details.cached_tokens = Some(multiply_token_count(
            split.cache_read_tokens,
            settings.cache_read_multiplier,
        ));
        prompt_details.cached_creation_tokens = Some(multiply_token_count(
            split.cache_write_tokens,
            settings.cache_write_multiplier,
        ));
    }
    usage.claude_cache_creation_5_m_tokens = Some(multiply_token_count(
        split.cache_write_5m_tokens,
        settings.cache_write_multiplier,
    ));
    usage.claude_cache_creation_1_h_tokens = Some(multiply_token_count(
        split.cache_write_1h_tokens,
        settings.cache_write_multiplier,
    ));
}
