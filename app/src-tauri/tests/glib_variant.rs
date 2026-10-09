//! Exercise the patched Linux GTK dependency with release optimizations in CI.
#![cfg(target_os = "linux")]

use glib::{variant::ToVariant, Variant};

#[test]
fn variant_strings_preserve_borrowed_values_from_both_ends() {
    let value =
        Variant::array_from_iter::<String>(["first", "β", "last"].map(|text| text.to_variant()));
    let mut strings = value.array_iter_str().unwrap();
    assert_eq!(strings.len(), 3);
    assert_eq!(strings.next(), Some("first"));
    assert_eq!(strings.next_back(), Some("last"));
    assert_eq!(strings.len(), 1);
    assert_eq!(strings.next(), Some("β"));
    assert_eq!(strings.next(), None);
    assert_eq!(strings.next_back(), None);
}

#[test]
fn variant_string_nth_out_of_range_exhausts_without_reading_a_child() {
    let value = Variant::array_from_iter::<String>(["first", "last"].map(|text| text.to_variant()));
    let mut forward = value.array_iter_str().unwrap();
    assert_eq!(forward.nth(2), None);
    assert_eq!(forward.len(), 0);
    assert_eq!(forward.next_back(), None);
    let mut backward = value.array_iter_str().unwrap();
    assert_eq!(backward.nth_back(2), None);
    assert_eq!(backward.len(), 0);
    assert_eq!(backward.next(), None);
}

#[test]
fn empty_variant_string_array_has_no_children() {
    let value = Variant::array_from_iter::<String>(std::iter::empty());
    let mut strings = value.array_iter_str().unwrap();
    assert_eq!(strings.len(), 0);
    assert_eq!(strings.next(), None);
    assert_eq!(strings.next_back(), None);
}
