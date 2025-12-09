#!/bin/bash
# Voice Audio Fixture Validation Script
#
# Validates and normalizes audio fixtures for consistent E2E testing.
# Requirements: ffprobe, ffmpeg
#
# Usage:
#   ./validate-fixtures.sh              # Validate all fixtures
#   ./validate-fixtures.sh --normalize  # Normalize non-compliant fixtures
#   ./validate-fixtures.sh --generate   # Generate CI fixtures (silence, noise)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCENARIOS_DIR="$SCRIPT_DIR/scenarios"
GENERATED_DIR="$SCRIPT_DIR/generated"

# Audio requirements
REQUIRED_SAMPLE_RATE=16000
REQUIRED_CHANNELS=1
REQUIRED_FORMAT="s16"  # 16-bit signed PCM

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check dependencies
check_dependencies() {
    local missing=()
    command -v ffprobe >/dev/null 2>&1 || missing+=("ffprobe")
    command -v ffmpeg >/dev/null 2>&1 || missing+=("ffmpeg")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo -e "${RED}Missing required tools: ${missing[*]}${NC}"
        echo "Install with: sudo apt-get install ffmpeg"
        exit 1
    fi
}

# Validate a single audio file
validate_fixture() {
    local file="$1"
    local errors=()

    if [[ ! -f "$file" ]]; then
        echo -e "${RED}MISSING:${NC} $file"
        return 1
    fi

    # Get audio properties
    local info
    info=$(ffprobe -v quiet -show_streams -select_streams a:0 "$file" 2>/dev/null)

    local sample_rate
    sample_rate=$(echo "$info" | grep "^sample_rate=" | cut -d= -f2)

    local channels
    channels=$(echo "$info" | grep "^channels=" | cut -d= -f2)

    local codec
    codec=$(echo "$info" | grep "^codec_name=" | cut -d= -f2)

    local duration
    duration=$(echo "$info" | grep "^duration=" | cut -d= -f2)

    # Check sample rate
    if [[ "$sample_rate" != "$REQUIRED_SAMPLE_RATE" ]]; then
        errors+=("sample_rate=$sample_rate (expected $REQUIRED_SAMPLE_RATE)")
    fi

    # Check channels
    if [[ "$channels" != "$REQUIRED_CHANNELS" ]]; then
        errors+=("channels=$channels (expected $REQUIRED_CHANNELS)")
    fi

    # Report results
    local filename
    filename=$(basename "$file")

    if [[ ${#errors[@]} -eq 0 ]]; then
        printf "${GREEN}OK${NC}    %-40s [%s, %sHz, %sch, %.1fs]\n" \
            "$filename" "$codec" "$sample_rate" "$channels" "$duration"
        return 0
    else
        printf "${YELLOW}WARN${NC}  %-40s [%s]\n" "$filename" "${errors[*]}"
        return 1
    fi
}

# Normalize a single audio file
normalize_fixture() {
    local input="$1"
    local temp_output="${input%.wav}_temp.wav"

    echo "Normalizing: $input"

    ffmpeg -y -i "$input" \
        -ar "$REQUIRED_SAMPLE_RATE" \
        -ac "$REQUIRED_CHANNELS" \
        -sample_fmt "$REQUIRED_FORMAT" \
        -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
        "$temp_output" 2>/dev/null

    mv "$temp_output" "$input"
    echo -e "${GREEN}Normalized:${NC} $input"
}

# Generate silence clip
generate_silence() {
    local duration="$1"
    local output="$GENERATED_DIR/silence-${duration}s.wav"

    mkdir -p "$GENERATED_DIR"

    ffmpeg -y -f lavfi \
        -i "anullsrc=r=$REQUIRED_SAMPLE_RATE:cl=mono" \
        -t "$duration" \
        -sample_fmt "$REQUIRED_FORMAT" \
        "$output" 2>/dev/null

    echo -e "${GREEN}Generated:${NC} silence-${duration}s.wav"
}

# Generate noise clip
generate_noise() {
    local type="$1"  # white, pink, brown
    local duration="$2"
    local amplitude="${3:-0.1}"
    local output="$GENERATED_DIR/noise-${type}-${duration}s.wav"

    mkdir -p "$GENERATED_DIR"

    ffmpeg -y -f lavfi \
        -i "anoisesrc=d=$duration:c=${type}:r=$REQUIRED_SAMPLE_RATE:a=$amplitude" \
        -ac 1 \
        -sample_fmt "$REQUIRED_FORMAT" \
        "$output" 2>/dev/null

    echo -e "${GREEN}Generated:${NC} noise-${type}-${duration}s.wav"
}

# Generate test tone
generate_tone() {
    local frequency="$1"
    local duration="$2"
    local output="$GENERATED_DIR/tone-${frequency}hz-${duration}s.wav"

    mkdir -p "$GENERATED_DIR"

    ffmpeg -y -f lavfi \
        -i "sine=frequency=$frequency:sample_rate=$REQUIRED_SAMPLE_RATE:duration=$duration" \
        -ac 1 \
        -sample_fmt "$REQUIRED_FORMAT" \
        "$output" 2>/dev/null

    echo -e "${GREEN}Generated:${NC} tone-${frequency}hz-${duration}s.wav"
}

# Validate all fixtures in a directory
validate_directory() {
    local dir="$1"
    local count=0
    local failed=0

    if [[ ! -d "$dir" ]]; then
        echo -e "${YELLOW}Directory not found:${NC} $dir"
        return 0
    fi

    echo -e "\n=== Validating: $dir ==="

    while IFS= read -r -d '' file; do
        ((count++))
        if ! validate_fixture "$file"; then
            ((failed++))
        fi
    done < <(find "$dir" -name "*.wav" -print0 2>/dev/null)

    if [[ $count -eq 0 ]]; then
        echo -e "${YELLOW}No .wav files found${NC}"
    else
        echo -e "\nValidated $count files, $failed with issues"
    fi

    return $failed
}

# Main execution
main() {
    check_dependencies

    local do_normalize=false
    local do_generate=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --normalize)
                do_normalize=true
                shift
                ;;
            --generate)
                do_generate=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [--normalize] [--generate]"
                echo ""
                echo "Options:"
                echo "  --normalize  Normalize non-compliant fixtures to required format"
                echo "  --generate   Generate CI fixtures (silence, noise clips)"
                echo ""
                echo "Audio requirements: ${REQUIRED_SAMPLE_RATE}Hz, ${REQUIRED_CHANNELS}ch, 16-bit PCM"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    echo "=================================="
    echo "Voice Audio Fixture Validator"
    echo "=================================="
    echo "Requirements: ${REQUIRED_SAMPLE_RATE}Hz, ${REQUIRED_CHANNELS}ch, 16-bit PCM"

    local total_failed=0

    # Validate existing fixtures
    validate_directory "$SCRIPT_DIR" || ((total_failed+=$?))
    validate_directory "$SCENARIOS_DIR" || ((total_failed+=$?))
    validate_directory "$GENERATED_DIR" || ((total_failed+=$?))

    # Normalize if requested
    if [[ "$do_normalize" == true ]]; then
        echo -e "\n=== Normalizing fixtures ==="
        while IFS= read -r -d '' file; do
            if ! validate_fixture "$file" >/dev/null 2>&1; then
                normalize_fixture "$file"
            fi
        done < <(find "$SCRIPT_DIR" -name "*.wav" -print0 2>/dev/null)
    fi

    # Generate CI fixtures if requested
    if [[ "$do_generate" == true ]]; then
        echo -e "\n=== Generating CI fixtures ==="
        generate_silence 3
        generate_silence 5
        generate_silence 10
        generate_noise "pink" 5 0.05
        generate_noise "white" 3 0.02
        generate_tone 440 1
        generate_tone 1000 1
    fi

    echo -e "\n=================================="
    if [[ $total_failed -eq 0 ]]; then
        echo -e "${GREEN}All fixtures validated successfully!${NC}"
        exit 0
    else
        echo -e "${YELLOW}$total_failed fixture(s) need attention${NC}"
        exit 1
    fi
}

main "$@"
